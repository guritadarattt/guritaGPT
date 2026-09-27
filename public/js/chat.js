let apiKey = localStorage.getItem('gptj_key') || '';
let currentConvId = null;
let conversations = [];

if (apiKey) {
  showChatApp();
  loadConversations();
} else {
  document.getElementById('keyGate').style.display = 'flex';
}

function saveKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) return showKeyError('API Key tidak boleh kosong');
  apiKey = key;
  localStorage.setItem('gptj_key', key);
  showChatApp();
  loadConversations();
}

function showKeyError(msg) {
  const el = document.getElementById('keyError');
  el.textContent = msg;
  setTimeout(() => el.textContent = '', 3000);
}

function showChatApp() {
  document.getElementById('keyGate').style.display = 'none';
  document.getElementById('chatApp').style.display = 'flex';
}

function logout() {
  if (!confirm('Yakin logout? API Key akan dihapus dari browser.')) return;
  localStorage.removeItem('gptj_key');
  apiKey = '';
  currentConvId = null;
  location.reload();
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    alert('API Key tidak valid. Silakan login ulang.');
    logout();
    throw new Error('unauthorized');
  }
  return res.json();
}

async function loadConversations() {
  const data = await apiFetch('/api/v1/conversations');
  conversations = data.conversations || [];
  renderConversations();
}

function renderConversations() {
  const el = document.getElementById('convList');
  if (conversations.length === 0) {
    el.innerHTML = '<div class="conv-empty">Belum ada percakapan</div>';
    return;
  }
  el.innerHTML = conversations.map(c => `
    <div class="conv-item ${c.id === currentConvId ? 'active' : ''}"
         onclick="openConversation('${c.id}')">
      <div class="conv-title">${escapeHtml(c.title)}</div>
      <div class="conv-meta">${c.message_count} pesan</div>
      <button class="conv-delete" onclick="event.stopPropagation();deleteConv('${c.id}')" title="Hapus">×</button>
    </div>
  `).join('');
}

async function newChat() {
  const conv = await apiFetch('/api/v1/conversations', {
    method: 'POST',
    body: JSON.stringify({ title: 'Percakapan Baru' }),
  });
  currentConvId = conv.id;
  conversations.unshift({ ...conv, message_count: 0 });
  renderConversations();
  renderMessages([]);
  document.getElementById('convTitle').textContent = conv.title;
  document.getElementById('msgInput').focus();
}

async function openConversation(id) {
  currentConvId = id;
  const data = await apiFetch(`/api/v1/conversations/${id}`);
  document.getElementById('convTitle').textContent = data.conversation.title;
  renderMessages(data.messages);
  renderConversations();
}

async function deleteConv(id) {
  if (!confirm('Hapus percakapan ini?')) return;
  await apiFetch(`/api/v1/conversations/${id}`, { method: 'DELETE' });
  conversations = conversations.filter(c => c.id !== id);
  if (currentConvId === id) {
    currentConvId = null;
    renderMessages([]);
    document.getElementById('convTitle').textContent = 'Pilih atau buat percakapan';
  }
  renderConversations();
}

function renderMessages(messages) {
  const el = document.getElementById('messages');
  if (!messages || messages.length === 0) {
    el.innerHTML = `<div class="empty-state">
      <h3>🐙 Mulai percakapan dengan Gurita GPT</h3>
      <p>Ketik pesan pertama di bawah.</p>
    </div>`;
    return;
  }
  el.innerHTML = messages.map(m => `
    <div class="msg ${m.role}">
      <div class="msg-content">${escapeHtml(m.content)}</div>
    </div>
  `).join('');
  el.scrollTop = el.scrollHeight;
}

function appendMessage(role, content) {
  const el = document.getElementById('messages');
  const empty = el.querySelector('.empty-state');
  if (empty) empty.remove();

  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.innerHTML = `<div class="msg-content">${escapeHtml(content)}</div>`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

async function send() {
  const input = document.getElementById('msgInput');
  const msg = input.value.trim();
  if (!msg) return;

  if (!currentConvId) {
    await newChat();
  }

  input.value = '';
  appendMessage('user', msg);

  const loading = document.createElement('div');
  loading.className = 'msg assistant loading';
  loading.innerHTML = '<div class="msg-content"><span class="dot">●</span><span class="dot">●</span><span class="dot">●</span></div>';
  document.getElementById('messages').appendChild(loading);
  document.getElementById('messages').scrollTop = 1e9;

  try {
    const useSearch = document.getElementById('useSearch').checked;
    const data = await apiFetch(`/api/v1/conversations/${currentConvId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message: msg, use_search: useSearch, max_tokens: 256 }),
    });

    loading.remove();
    appendMessage('assistant', data.assistant_message.content);

    if (data.search_used) {
      const note = document.createElement('div');
      note.className = 'msg system';
      note.textContent = '🔍 Gurita GPT menggunakan data internet terbaru';
      document.getElementById('messages').appendChild(note);
      document.getElementById('messages').scrollTop = 1e9;
    }

    await loadConversations();
    const current = conversations.find(c => c.id === currentConvId);
    if (current) document.getElementById('convTitle').textContent = current.title;

  } catch (err) {
    loading.remove();
    appendMessage('system', 'Error: ' + err.message);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}