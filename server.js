import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createApiKey, validateKey, logUsage, getStats, getAllKeys, db,
  createConversation, listConversations, getConversation,
  updateConversationTitle, deleteConversation,
  addMessage, getMessages,
} from './db.js';
import { generate } from './model.js';
import { generateTitle } from './title.js';
import { webSearch, buildSearchEnhancedPrompt, buildConversationPrompt, isGreeting } from './search.js';
import { loadPersona, savePersona } from './persona.js';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let trainingExamples = [];
try {
  trainingExamples = JSON.parse(fs.readFileSync('./data/training_data.json', 'utf-8'));
} catch { trainingExamples = []; }

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'owner-secret-change-me';

function adminAuth(req, res, next) {
  if (req.headers['x-admin-token'] !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Admin unauthorized' });
  }
  next();
}

function keyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'X-Api-Key required' });
  const record = validateKey(apiKey);
  if (!record) return res.status(401).json({ error: 'Invalid API key' });
  req.keyRecord = record;
  next();
}

// ============ PAGES ============
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/docs', (req, res) => res.sendFile(path.join(__dirname, 'public/docs.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'public/chat.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

// ============ CHAT API (multi-conversation) ============

app.get('/api/v1/conversations', keyAuth, (req, res) => {
  const list = listConversations(req.keyRecord.id);
  res.json({ conversations: list });
});

app.post('/api/v1/conversations', keyAuth, (req, res) => {
  const { title } = req.body || {};
  const conv = createConversation(req.keyRecord.id, title || 'Percakapan Baru');
  res.json(conv);
});

app.get('/api/v1/conversations/:id', keyAuth, (req, res) => {
  const conv = getConversation(req.params.id, req.keyRecord.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  const messages = getMessages(conv.id);
  res.json({ conversation: conv, messages });
});

app.patch('/api/v1/conversations/:id', keyAuth, (req, res) => {
  const { title } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  const conv = getConversation(req.params.id, req.keyRecord.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  updateConversationTitle(conv.id, title);
  res.json({ ok: true });
});

app.delete('/api/v1/conversations/:id', keyAuth, (req, res) => {
  const ok = deleteConversation(req.params.id, req.keyRecord.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

app.post('/api/v1/conversations/:id/messages', keyAuth, async (req, res) => {
  const { message, use_search = false, max_tokens = 256 } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const conv = getConversation(req.params.id, req.keyRecord.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });

  const userMsg = addMessage(conv.id, 'user', message);

  const isFirstMessage = getMessages(conv.id).length === 1;
  if (isFirstMessage) {
    generateTitle(message)
      .then(title => updateConversationTitle(conv.id, title))
      .catch(err => console.error('[title]', err.message));
  }

  let reply;
  let searchResults = [];

  // Fast-path: kalau user cuma nyapa di pesan pertama, langsung balas greeting persona
  if (isGreeting(message) && isFirstMessage) {
    const persona = loadPersona();
    reply = persona.greeting || 'Halo! Ada yang bisa saya bantu?';
  } else {
    const history = getMessages(conv.id).slice(-8);

    if (use_search) {
      searchResults = await webSearch(message);
    }

    const prompt = buildConversationPrompt(history, searchResults, trainingExamples);
    const output = await generate(prompt, { max_new_tokens: max_tokens });
    reply = output.replace(prompt, '').trim() || output;
  }

  const assistantMsg = addMessage(conv.id, 'assistant', reply);
  logUsage(req.keyRecord.id, '/api/v1/chat', max_tokens);

  res.json({
    conversation_id: conv.id,
    user_message: userMsg,
    assistant_message: assistantMsg,
    search_used: searchResults.length > 0,
    sources: searchResults.map(r => ({ text: r.text, source: r.source })),
  });
});

// Endpoint lama (stateless) — untuk kompatibilitas API
app.post('/api/v1/chat', keyAuth, async (req, res) => {
  const { message, use_search = false, max_tokens = 256 } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  let searchResults = [];
  if (use_search) searchResults = await webSearch(message);

  const prompt = buildSearchEnhancedPrompt(message, searchResults, trainingExamples);
  const output = await generate(prompt, { max_new_tokens: max_tokens });
  const reply = output.replace(prompt, '').trim() || output;

  logUsage(req.keyRecord.id, '/api/v1/chat', max_tokens);
  res.json({ reply, search_used: searchResults.length > 0 });
});

// ============ HEALTH & ADMIN ============
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', model: 'gpt-j-6b', name: 'Gurita GPT', timestamp: Date.now() });
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_SECRET) res.json({ token: ADMIN_SECRET });
  else res.status(401).json({ error: 'Wrong password' });
});

app.post('/api/admin/keys', adminAuth, (req, res) => {
  const { name } = req.body;
  res.json(createApiKey(name || 'untitled', false));
});

app.get('/api/admin/keys', adminAuth, (req, res) => res.json(getAllKeys()));
app.get('/api/admin/stats', adminAuth, (req, res) => res.json(getStats()));

app.get('/api/admin/conversations', adminAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, k.name as key_name
    FROM conversations c
    LEFT JOIN api_keys k ON k.id = c.key_id
    ORDER BY c.updated_at DESC
    LIMIT 200
  `).all();
  res.json(rows);
});

// ---- Persona management ----
app.get('/api/admin/persona', adminAuth, (req, res) => {
  res.json(loadPersona());
});

app.post('/api/admin/persona', adminAuth, (req, res) => {
  try {
    const saved = savePersona(req.body);
    res.json({ ok: true, persona: saved });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/owner-chat', adminAuth, async (req, res) => {
  const { message, max_tokens = 512, temperature = 0.8 } = req.body;
  const prompt = buildConversationPrompt(
    [{ role: 'user', content: message }],
    [],
    trainingExamples,
    'owner'
  );
  const output = await generate(prompt, { max_new_tokens: max_tokens, temperature });
  const reply = output.replace(prompt, '').trim() || output;
  res.json({ reply });
});

app.listen(PORT, () => {
  console.log(`[server] 🐙 Gurita GPT — http://localhost:${PORT}`);
  console.log(`[server] admin token: ${ADMIN_SECRET}`);
  import('./model.js').then(m => m.initModel()).catch(console.error);
});