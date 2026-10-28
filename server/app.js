const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const db = require('./db');
const { createSession, requireUser } = require('./auth');
const { roleFor, canEdit, listForUser } = require('./documents');
const { importFile, sanitizeContent } = require('./import');
const { htmlToMarkdown } = require('./export');

const MAX_CONTENT_BYTES = 500_000;
const MAX_TITLE_LEN = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const asInt = (v) => (/^\d+$/.test(String(v)) ? Number(v) : null);

// Naive in-memory limiter for the login endpoint (30 req/min/IP).
// Sufficient for a demo deployment; a real deployment would use a shared store.
const loginHits = new Map();
function loginLimiter(req, res, next) {
  const now = Date.now();
  const rec = loginHits.get(req.ip);
  if (!rec || now > rec.resetAt) {
    loginHits.set(req.ip, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  rec.count += 1;
  if (rec.count > 30) return res.status(429).json({ error: 'Too many attempts, try again shortly' });
  next();
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
    });
    next();
  });

  app.use(express.static(path.join(__dirname, '..', 'client')));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Public: the demo login picker needs the user directory.
  app.get('/api/users', (_req, res) => {
    res.json(db.prepare('SELECT id, email, name FROM users ORDER BY id').all());
  });

  app.post('/api/login', loginLimiter, (req, res) => {
    const email = req.body && req.body.email;
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(404).json({ error: 'Unknown user' });
    const sid = createSession(user.id);
    res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax' });
    res.json({ id: user.id, email: user.email, name: user.name });
  });

  app.post('/api/logout', (req, res) => {
    if (req.cookies && req.cookies.sid) {
      db.prepare('DELETE FROM sessions WHERE sid = ?').run(req.cookies.sid);
    }
    res.clearCookie('sid').json({ ok: true });
  });

  app.get('/api/me', requireUser, (req, res) => res.json(req.user));

  app.get('/api/documents', requireUser, (req, res) => res.json(listForUser(req.user.id)));

  app.post('/api/documents', requireUser, (req, res) => {
    const raw = req.body && req.body.title;
    const title = (typeof raw === 'string' && raw.trim() ? raw.trim() : 'Untitled').slice(0, MAX_TITLE_LEN);
    const info = db.prepare(
      `INSERT INTO documents (title, content_html, owner_id) VALUES (?, '', ?)`
    ).run(title, req.user.id);
    res.status(201).json({ id: info.lastInsertRowid, title, content_html: '', role: 'owner' });
  });

  app.get('/api/documents/:id', requireUser, (req, res) => {
    const id = asInt(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid document id' });
    const role = roleFor(id, req.user.id);
    if (!role) return res.status(404).json({ error: 'Not found' });
    const doc = db.prepare('SELECT id, title, content_html, updated_at FROM documents WHERE id = ?').get(id);
    res.json({ ...doc, role });
  });

  app.put('/api/documents/:id', requireUser, (req, res) => {
    const id = asInt(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid document id' });
    const role = roleFor(id, req.user.id);
    if (!role) return res.status(404).json({ error: 'Not found' });
    if (!canEdit(role)) return res.status(403).json({ error: 'Read-only access' });

    const body = req.body || {};
    if (body.content_html != null && typeof body.content_html !== 'string') {
      return res.status(400).json({ error: 'Invalid content' });
    }
    const html = sanitizeContent(String(body.content_html ?? '').slice(0, MAX_CONTENT_BYTES));
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, MAX_TITLE_LEN) : '';

    if (title) {
      db.prepare(`UPDATE documents SET title = ?, content_html = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(title, html, id);
    } else {
      db.prepare(`UPDATE documents SET content_html = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(html, id);
    }
    const { updated_at } = db.prepare('SELECT updated_at FROM documents WHERE id = ?').get(id);
    res.json({ ok: true, updated_at });
  });

  app.delete('/api/documents/:id', requireUser, (req, res) => {
    const id = asInt(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid document id' });
    const doc = db.prepare('SELECT owner_id FROM documents WHERE id = ?').get(id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (doc.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can delete' });
    db.prepare('DELETE FROM documents WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  app.post('/api/documents/:id/share', requireUser, (req, res) => {
    const id = asInt(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid document id' });
    const doc = db.prepare('SELECT owner_id FROM documents WHERE id = ?').get(id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (doc.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can share' });

    const { email, role } = req.body || {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    if (!['read', 'edit'].includes(role)) return res.status(400).json({ error: 'Role must be read or edit' });
    const target = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (!target) return res.status(404).json({ error: `No user with email ${email}` });
    if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot share with yourself' });

    db.prepare(
      `INSERT INTO access (document_id, user_id, role) VALUES (?, ?, ?)
       ON CONFLICT(document_id, user_id) DO UPDATE SET role = excluded.role`
    ).run(id, target.id, role);
    res.json({ ok: true });
  });

  app.delete('/api/documents/:id/share/:userId', requireUser, (req, res) => {
    const id = asInt(req.params.id);
    const userId = asInt(req.params.userId);
    if (id === null || userId === null) return res.status(400).json({ error: 'Invalid id' });
    const doc = db.prepare('SELECT owner_id FROM documents WHERE id = ?').get(id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (doc.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can revoke access' });
    db.prepare('DELETE FROM access WHERE document_id = ? AND user_id = ?').run(id, userId);
    res.json({ ok: true });
  });

  app.get('/api/documents/:id/shares', requireUser, (req, res) => {
    const id = asInt(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid document id' });
    const doc = db.prepare('SELECT owner_id FROM documents WHERE id = ?').get(id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (doc.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can view shares' });
    const shares = db.prepare(
      `SELECT u.id, u.email, u.name, a.role FROM access a JOIN users u ON u.id = a.user_id WHERE a.document_id = ?`
    ).all(id);
    res.json(shares);
  });

  app.get('/api/documents/:id/export', requireUser, (req, res) => {
    const id = asInt(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid document id' });
    const role = roleFor(id, req.user.id);
    if (!role) return res.status(404).json({ error: 'Not found' });
    const doc = db.prepare('SELECT title, content_html FROM documents WHERE id = ?').get(id);
    const safe = doc.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'document';
    res.set({
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safe}.md"`,
    });
    res.send(htmlToMarkdown(doc.content_html));
  });

  app.post('/api/import', requireUser, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
      const html = await importFile(req.file.buffer, req.file.mimetype, req.file.originalname);
      const title = req.file.originalname.replace(/\.(md|txt|docx)$/i, '').slice(0, MAX_TITLE_LEN) || 'Imported';
      const info = db.prepare(
        'INSERT INTO documents (title, content_html, owner_id) VALUES (?, ?, ?)'
      ).run(title, html, req.user.id);
      res.status(201).json({ id: info.lastInsertRowid });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // SPA fallback
  app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '..', 'client', 'index.html')));

  // Central error handler (multer errors, JSON parse errors, unexpected failures)
  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 2 MB)' : err.message;
      return res.status(413).json({ error: msg });
    }
    if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) {
      return res.status(400).json({ error: 'Invalid request body' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
