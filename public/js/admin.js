let token = localStorage.getItem('admin_token') || '';

if (token) showPanel();

async function adminLogin() {
  const pass = document.getElementById('adminPass').value;
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ password: pass })
  });
  if (res.ok) {
    const data = await res.json();
    token = data.token;
    localStorage.setItem('admin_token', token);
    showPanel();
  } else {
    alert('Password salah');
  }
}

function showPanel() {
  document.getElementById('loginBox').style.display = 'none';
  document.getElementById('adminPanel').style.display = 'block';
  loadStats();
  loadKeys();
  loadPersona();
  loadAdminConversations();
}

async function loadStats() {
  const res = await fetch('/api/admin/stats', { headers: {'x-admin-token': token} });
  const s = await res.json();
  document.getElementById('stats').innerHTML = `
    <p>Total Keys: ${s.totalKeys} | Total Requests: ${s.totalRequests} |
       Tokens: ${s.totalTokens} | Percakapan: ${s.totalConversations || 0}</p>
  `;
}

async function loadKeys() {
  const res = await fetch('/api/admin/keys', { headers: {'x-admin-token': token} });
  const keys = await res.json();
  document.getElementById('keys').innerHTML = keys.map(k =>
    `<div class="key-item">
      <code>${k.key}</code> — ${k.name} (used: ${k.usage_count})
    </div>`
  ).join('');
}

async function createKey() {
  const name = prompt('Nama untuk key ini:');
  if (!name) return;
  await fetch('/api/admin/keys', {
    method: 'POST',
    headers: {'Content-Type':'application/json','x-admin-token':token},
    body: JSON.stringify({ name })
  });
  loadKeys();
}

async function loadPersona() {
  const res = await fetch('/api/admin/persona', {
    headers: { 'x-admin-token': token }
  });
  const p = await res.json();
  document.getElementById('pName').value = p.name || '';
  document.getElementById('pIdentity').value = p.identity || '';
  document.getElementById('pLanguage').value = p.language || '';
  document.getElementById('pTone').value = p.tone || '';
  document.getElementById('pTraits').value = (p.traits || []).join('\n');
  document.getElementById('pRules').value = (p.rules || []).join('\n');
  document.getElementById('pGreeting').value = p.greeting || '';
}

async function savePersona() {
  const persona = {
    name: document.getElementById('pName').value.trim(),
    identity: document.getElementById('pIdentity').value.trim(),
    language: document.getElementById('pLanguage').value.trim(),
    tone: document.getElementById('pTone').value.trim(),
    traits: document.getElementById('pTraits').value.split('\n').map(s => s.trim()).filter(Boolean),
    rules: document.getElementById('pRules').value.split('\n').map(s => s.trim()).filter(Boolean),
    greeting: document.getElementById('pGreeting').value.trim(),
  };

  const res = await fetch('/api/admin/persona', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify(persona)
  });

  const status = document.getElementById('personaStatus');
  if (res.ok) {
    status.textContent = '✅ Persona tersimpan. Berlaku untuk chat berikutnya.';
    status.style.color = '#4ade80';
  } else {
    status.textContent = '❌ Gagal simpan';
    status.style.color = '#f87171';
  }
  setTimeout(() => status.textContent = '', 3000);
}

async function loadAdminConversations() {
  const res = await fetch('/api/admin/conversations', {
    headers: { 'x-admin-token': token }
  });
  const list = await res.json();
  document.getElementById('adminConversations').innerHTML = list.length === 0
    ? '<p>Belum ada percakapan.</p>'
    : list.map(c => `
      <div class="key-item">
        <strong>${escapeHtml(c.title)}</strong> —
        <small>key: ${escapeHtml(c.key_name || 'unknown')} |
        ${new Date(c.updated_at).toLocaleString('id-ID')}</small>
      </div>
    `).join('');
}

async function ownerSend() {
  const input = document.getElementById('ownerInput');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  addOwnerMsg('user', msg);
  const res = await fetch('/api/admin/owner-chat', {
    method: 'POST',
    headers: {'Content-Type':'application/json','x-admin-token':token},
    body: JSON.stringify({ message: msg, max_tokens: 512 })
  });
  const data = await res.json();
  addOwnerMsg('assistant', data.reply);
}

function addOwnerMsg(role, text) {
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.textContent = text;
  document.getElementById('ownerMessages').appendChild(div);
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}