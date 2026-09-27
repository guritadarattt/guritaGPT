import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

const DATA_DIR = './data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'users.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    key TEXT UNIQUE,
    name TEXT,
    owner TEXT DEFAULT 'user',
    is_admin INTEGER DEFAULT 0,
    usage_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    created_at INTEGER,
    last_used INTEGER
  );

  CREATE TABLE IF NOT EXISTS usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_id TEXT,
    endpoint TEXT,
    tokens INTEGER,
    created_at INTEGER
  );

  -- BARU: tabel percakapan
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    key_id TEXT,
    title TEXT DEFAULT 'Percakapan Baru',
    created_at INTEGER,
    updated_at INTEGER
  );

  -- BARU: tabel pesan per percakapan
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT,
    role TEXT,
    content TEXT,
    created_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_conv_key ON conversations(key_id);
`);

// ---------- API Keys ----------
export function createApiKey(name, isAdmin = false) {
  const key = 'gptj_' + uuidv4().replace(/-/g, '');
  const id = uuidv4();
  db.prepare(`
    INSERT INTO api_keys (id, key, name, is_admin, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, key, name, isAdmin ? 1 : 0, Date.now());
  return { id, key, name, isAdmin };
}

export function validateKey(key) {
  return db.prepare('SELECT * FROM api_keys WHERE key = ?').get(key) || null;
}

export function logUsage(keyId, endpoint, tokens = 0) {
  db.prepare(`
    INSERT INTO usage_logs (key_id, endpoint, tokens, created_at)
    VALUES (?, ?, ?, ?)
  `).run(keyId, endpoint, tokens, Date.now());

  db.prepare(`
    UPDATE api_keys 
    SET usage_count = usage_count + 1,
        total_tokens = total_tokens + ?,
        last_used = ?
    WHERE id = ?
  `).run(tokens, Date.now(), keyId);
}

// ---------- Conversations ----------
export function createConversation(keyId, title = 'Percakapan Baru') {
  const id = uuidv4();
  const now = Date.now();
  db.prepare(`
    INSERT INTO conversations (id, key_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, keyId, title, now, now);
  return { id, title, created_at: now, updated_at: now };
}

export function listConversations(keyId) {
  return db.prepare(`
    SELECT c.*, 
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
    FROM conversations c
    WHERE c.key_id = ?
    ORDER BY c.updated_at DESC
  `).all(keyId);
}

export function getConversation(convId, keyId) {
  return db.prepare(`
    SELECT * FROM conversations WHERE id = ? AND key_id = ?
  `).get(convId, keyId) || null;
}

export function updateConversationTitle(convId, title) {
  db.prepare(`
    UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?
  `).run(title, Date.now(), convId);
}

export function touchConversation(convId) {
  db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`)
    .run(Date.now(), convId);
}

export function deleteConversation(convId, keyId) {
  const conv = getConversation(convId, keyId);
  if (!conv) return false;
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(convId);
  db.prepare('DELETE FROM conversations WHERE id = ?').run(convId);
  return true;
}

// ---------- Messages ----------
export function addMessage(convId, role, content) {
  const now = Date.now();
  const result = db.prepare(`
    INSERT INTO messages (conversation_id, role, content, created_at)
    VALUES (?, ?, ?, ?)
  `).run(convId, role, content, now);
  touchConversation(convId);
  return { id: result.lastInsertRowid, role, content, created_at: now };
}

export function getMessages(convId, limit = 50) {
  return db.prepare(`
    SELECT * FROM messages 
    WHERE conversation_id = ? 
    ORDER BY created_at ASC 
    LIMIT ?
  `).all(convId, limit);
}

// ---------- Stats ----------
export function getStats() {
  const totalKeys = db.prepare('SELECT COUNT(*) as c FROM api_keys').get().c;
  const totalRequests = db.prepare('SELECT COUNT(*) as c FROM usage_logs').get().c;
  const totalTokens = db.prepare('SELECT SUM(tokens) as t FROM usage_logs').get().t || 0;
  const totalConversations = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
  const recentUsage = db.prepare(`
    SELECT endpoint, COUNT(*) as count 
    FROM usage_logs 
    WHERE created_at > ?
    GROUP BY endpoint
  `).all(Date.now() - 7 * 24 * 3600 * 1000);
  return { totalKeys, totalRequests, totalTokens, totalConversations, recentUsage };
}

export function getAllKeys() {
  return db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC').all();
}

export default db;