'use strict';

const root = document.getElementById('root');
let state = { user: null, view: 'login', doc: null };
let saveTimer = null;
let dirty = false;
let currentFlush = null; // set while the editor is mounted

// ---------- helpers ----------

async function api(method, url, body, isForm) {
  const opts = { method, headers: {} };
  if (body && !isForm) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (body && isForm) opts.body = body;
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtDate(sqlUtc) {
  if (!sqlUtc) return '';
  const d = new Date(String(sqlUtc).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function toast(msg, type = 'error') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// Flush a pending autosave when the tab hides or the page unloads.
// fetch with keepalive survives page teardown, unlike a plain async save.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && currentFlush) currentFlush();
});
window.addEventListener('pagehide', () => {
  if (currentFlush) currentFlush();
});

// ---------- views ----------

async function boot() {
  try {
    state.user = await api('GET', '/api/me');
    state.view = 'dash';
  } catch {
    state.view = 'login';
  }
  render();
}

function render() {
  currentFlush = null;
  if (state.view === 'login') return renderLogin();
  if (state.view === 'dash') return renderDash();
  if (state.view === 'editor') return renderEditor();
}

async function renderLogin() {
  let users = [];
  try {
    users = await api('GET', '/api/users');
  } catch (e) {
    toast(e.message);
  }
  root.innerHTML = `
    <div class="login">
      <h1>Ajaia Docs</h1>
      <p class="muted">Lightweight collaborative documents. Pick a demo account to sign in:</p>
      <div class="userlist">
        ${users.map((u) => `
          <button data-email="${esc(u.email)}">
            <strong>${esc(u.name)}</strong>
            <small>${esc(u.email)}</small>
          </button>`).join('')}
      </div>
      <p class="muted small">Demo build: no passwords — accounts are seeded for review.</p>
    </div>`;
  root.querySelectorAll('.userlist button').forEach((b) => {
    b.onclick = async () => {
      try {
        state.user = await api('POST', '/api/login', { email: b.dataset.email });
        state.view = 'dash';
        render();
      } catch (e) {
        toast(e.message);
      }
    };
  });
}

async function renderDash() {
  let owned = [], shared = [];
  try {
    ({ owned, shared } = await api('GET', '/api/documents'));
  } catch (e) {
    toast(e.message);
  }
  root.innerHTML = `
    <header class="top">
      <div class="brand">Ajaia Docs</div>
      <div class="spacer"></div>
      <div class="muted">${esc(state.user.name)}</div>
      <button id="logout" class="link">Log out</button>
    </header>
    <main class="dash">
      <div class="dash-head">
        <h2>My documents</h2>
        <div class="actions">
          <label class="filebtn" title="Supported: .txt, .md, .docx (max 2 MB)">
            Import file
            <input id="import" type="file" accept=".txt,.md,.docx" hidden />
          </label>
          <button id="new-doc" class="primary">+ New document</button>
        </div>
      </div>
      <p class="muted small">Import supports .txt, .md, and .docx up to 2 MB.</p>
      <ul class="doclist">
        ${owned.length ? owned.map((d) => `
          <li data-id="${d.id}">
            <span class="title">${esc(d.title)}</span>
            <span class="meta">${fmtDate(d.updated_at)}</span>
            <button class="del" data-del="${d.id}" title="Delete document">✕</button>
          </li>`).join('') : '<li class="empty">No documents yet — create one or import a file.</li>'}
      </ul>
      <h2>Shared with me</h2>
      <ul class="doclist">
        ${shared.length ? shared.map((d) => `
          <li data-id="${d.id}">
            <span class="title">${esc(d.title)}</span>
            <span class="meta">from ${esc(d.owner_name)} · ${fmtDate(d.updated_at)}</span>
            <span class="badge ${d.role}">${d.role === 'edit' ? 'Can edit' : 'View only'}</span>
          </li>`).join('') : '<li class="empty">Nothing shared with you yet.</li>'}
      </ul>
    </main>`;

  root.querySelector('#logout').onclick = async () => {
    await api('POST', '/api/logout').catch(() => {});
    state = { user: null, view: 'login', doc: null };
    render();
  };
  root.querySelector('#new-doc').onclick = async () => {
    try {
      const d = await api('POST', '/api/documents', { title: 'Untitled' });
      openEditor(d.id);
    } catch (e) {
      toast(e.message);
    }
  };
  root.querySelector('#import').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('file', f);
    try {
      const d = await api('POST', '/api/import', fd, true);
      toast(`Imported "${f.name}"`, 'ok');
      openEditor(d.id);
    } catch (err) {
      toast(err.message);
      e.target.value = '';
    }
  };
  root.querySelectorAll('.doclist li[data-id]').forEach((li) => {
    li.onclick = () => openEditor(li.dataset.id);
  });
  root.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this document? This cannot be undone.')) return;
      try {
        await api('DELETE', `/api/documents/${b.dataset.del}`);
        toast('Document deleted', 'ok');
        renderDash();
      } catch (err) {
        toast(err.message);
      }
    };
  });
}

async function openEditor(id) {
  try {
    const doc = await api('GET', `/api/documents/${id}`);
    state.doc = doc;
    state.view = 'editor';
    render();
  } catch (e) {
    toast(e.message);
  }
}

function renderEditor() {
  const { doc } = state;
  const readOnly = doc.role === 'read';
  dirty = false;

  root.innerHTML = `
    <header class="top">
      <a href="#" id="back">← Docs</a>
      <input id="title" maxlength="200" value="${esc(doc.title)}" ${readOnly ? 'disabled' : ''} />
      <div id="saveStatus" class="muted small"></div>
      <a class="btn" id="export" href="/api/documents/${doc.id}/export" download>Export .md</a>
      <button id="share" class="primary" ${doc.role !== 'owner' ? 'hidden' : ''}>Share</button>
    </header>
    ${readOnly ? '<div class="banner">You have view-only access to this document.</div>' : ''}
    <div class="toolbar" ${readOnly ? 'hidden' : ''}>
      <button data-cmd="bold" title="Bold"><b>B</b></button>
      <button data-cmd="italic" title="Italic"><i>I</i></button>
      <button data-cmd="underline" title="Underline"><u>U</u></button>
      <span class="sep"></span>
      <select id="block" title="Text style">
        <option value="p">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <span class="sep"></span>
      <button data-cmd="insertUnorderedList" title="Bulleted list">• List</button>
      <button data-cmd="insertOrderedList" title="Numbered list">1. List</button>
    </div>
    <div id="editor" class="editor" contenteditable="${!readOnly}" spellcheck="true">${doc.content_html || '<p><br></p>'}</div>
    <div id="sharePanel" class="panel" hidden></div>`;

  const editor = root.querySelector('#editor');
  const title = root.querySelector('#title');
  const status = root.querySelector('#saveStatus');
  status.textContent = doc.updated_at ? `Saved ${fmtDate(doc.updated_at)}` : '';

  const payload = () => ({ title: title.value, content_html: editor.innerHTML });

  async function save(useKeepalive) {
    if (!dirty || readOnly) return;
    dirty = false;
    status.textContent = 'Saving…';
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload()),
        keepalive: !!useKeepalive,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      status.textContent = data.updated_at ? `Saved ${fmtDate(data.updated_at)}` : 'Saved';
    } catch (e) {
      dirty = true; // keep the dirty flag so the next change retries
      status.textContent = 'Save failed';
      toast(e.message);
    }
  }

  function scheduleSave() {
    if (readOnly) return;
    dirty = true;
    status.textContent = 'Editing…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save(false), 700);
  }

  currentFlush = () => {
    clearTimeout(saveTimer);
    save(true);
  };

  root.querySelector('#back').onclick = async (e) => {
    e.preventDefault();
    clearTimeout(saveTimer);
    if (dirty && !readOnly) await save(false);
    currentFlush = null;
    state.view = 'dash';
    render();
  };

  if (!readOnly) {
    // NOTE: document.execCommand is deprecated but remains the only API with
    // universal browser support for contenteditable; see ARCHITECTURE.md.
    root.querySelectorAll('.toolbar [data-cmd]').forEach((b) => {
      b.onmousedown = (e) => {
        e.preventDefault(); // keep the text selection
        document.execCommand(b.dataset.cmd, false, null);
        scheduleSave();
      };
    });
    root.querySelector('#block').onchange = (e) => {
      document.execCommand('formatBlock', false, `<${e.target.value}>`);
      scheduleSave();
    };
    editor.addEventListener('input', scheduleSave);
    title.addEventListener('input', scheduleSave);
  }

  if (doc.role === 'owner') {
    const panel = root.querySelector('#sharePanel');
    const shareBtn = root.querySelector('#share');
    shareBtn.onclick = () => {
      if (panel.hidden) {
        panel.hidden = false;
        renderSharePanel(panel, doc.id);
      } else {
        panel.hidden = true;
      }
    };
  }
}

async function renderSharePanel(panel, docId) {
  let shares = [];
  try {
    shares = await api('GET', `/api/documents/${docId}/shares`);
  } catch (e) {
    toast(e.message);
  }
  panel.innerHTML = `
    <h3>Share this document</h3>
    <div class="sharerow">
      <input id="shareEmail" type="email" placeholder="teammate@ajaia.dev" />
      <select id="shareRole">
        <option value="edit">Can edit</option>
        <option value="read">View only</option>
      </select>
      <button id="shareAdd" class="primary">Share</button>
    </div>
    <ul class="sharelist">
      ${shares.map((s) => `
        <li>
          <span>${esc(s.name)} <span class="muted">${esc(s.email)}</span></span>
          <span class="badge ${s.role}">${s.role === 'edit' ? 'Can edit' : 'View only'}</span>
          <button class="del" data-rm="${s.id}" title="Remove access">✕</button>
        </li>`).join('') || '<li class="empty">Not shared with anyone yet.</li>'}
    </ul>`;

  panel.querySelector('#shareAdd').onclick = async () => {
    const email = panel.querySelector('#shareEmail').value.trim();
    const role = panel.querySelector('#shareRole').value;
    if (!email) return toast('Enter an email address');
    try {
      await api('POST', `/api/documents/${docId}/share`, { email, role });
      toast(`Shared with ${email}`, 'ok');
      renderSharePanel(panel, docId);
    } catch (e) {
      toast(e.message);
    }
  };
  panel.querySelectorAll('[data-rm]').forEach((b) => {
    b.onclick = async () => {
      try {
        await api('DELETE', `/api/documents/${docId}/share/${b.dataset.rm}`);
        toast('Access removed', 'ok');
        renderSharePanel(panel, docId);
      } catch (e) {
        toast(e.message);
      }
    };
  });
}

boot();
