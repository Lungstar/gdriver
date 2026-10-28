const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const tmp = path.join(os.tmpdir(), `ajaia-api-test-${process.pid}.db`);
process.env.DB_PATH = tmp;

const db = require('../server/db');
const { createApp } = require('../server/app');

let server;
let base;

const jar = {}; // email -> cookie header

async function login(email) {
  const r = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  assert.strictEqual(r.status, 200);
  jar[email] = r.headers.get('set-cookie').split(';')[0];
}

const H = (email) => ({ 'Content-Type': 'application/json', Cookie: jar[email] });

test.before(async () => {
  db.seedUsers();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.on('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  await login('alice@ajaia.dev');
  await login('bob@ajaia.dev');
  await login('carol@ajaia.dev');
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(tmp + suffix); } catch { /* ignore */ }
  }
});

test('unauthenticated requests are rejected', async () => {
  const r = await fetch(`${base}/api/documents`);
  assert.strictEqual(r.status, 401);
});

test('login validates email and rejects unknown users', async () => {
  let r = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email' }),
  });
  assert.strictEqual(r.status, 400);
  r = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ghost@ajaia.dev' }),
  });
  assert.strictEqual(r.status, 404);
});

test('full sharing flow: create, sanitize, share, enforce, revoke', async () => {
  // Alice creates a document
  let r = await fetch(`${base}/api/documents`, {
    method: 'POST', headers: H('alice@ajaia.dev'),
    body: JSON.stringify({ title: 'Roadmap' }),
  });
  assert.strictEqual(r.status, 201);
  const { id } = await r.json();

  // Alice saves content containing an XSS payload — it must be sanitized
  r = await fetch(`${base}/api/documents/${id}`, {
    method: 'PUT', headers: H('alice@ajaia.dev'),
    body: JSON.stringify({
      title: 'Roadmap v2',
      content_html: '<h1>Plan</h1><p onclick="x()">hi</p><script>alert(1)</script>',
    }),
  });
  assert.strictEqual(r.status, 200);
  r = await fetch(`${base}/api/documents/${id}`, { headers: H('alice@ajaia.dev') });
  let doc = await r.json();
  assert.strictEqual(doc.title, 'Roadmap v2');
  assert.ok(!doc.content_html.includes('<script'));
  assert.ok(!doc.content_html.includes('onclick'));
  assert.ok(doc.content_html.includes('<h1>Plan</h1>'));
  assert.strictEqual(doc.role, 'owner');

  // Bob cannot see it before sharing
  r = await fetch(`${base}/api/documents/${id}`, { headers: H('bob@ajaia.dev') });
  assert.strictEqual(r.status, 404);

  // Alice shares with Bob (edit) and Carol (read)
  r = await fetch(`${base}/api/documents/${id}/share`, {
    method: 'POST', headers: H('alice@ajaia.dev'),
    body: JSON.stringify({ email: 'bob@ajaia.dev', role: 'edit' }),
  });
  assert.strictEqual(r.status, 200);
  r = await fetch(`${base}/api/documents/${id}/share`, {
    method: 'POST', headers: H('alice@ajaia.dev'),
    body: JSON.stringify({ email: 'carol@ajaia.dev', role: 'read' }),
  });
  assert.strictEqual(r.status, 200);

  // Bob sees it under "shared with me" and can edit
  r = await fetch(`${base}/api/documents`, { headers: H('bob@ajaia.dev') });
  const bobLists = await r.json();
  assert.ok(bobLists.shared.some((d) => d.id === id && d.role === 'edit' && d.owner_name === 'Alice'));
  r = await fetch(`${base}/api/documents/${id}`, {
    method: 'PUT', headers: H('bob@ajaia.dev'),
    body: JSON.stringify({ content_html: '<p>bob was here</p>' }),
  });
  assert.strictEqual(r.status, 200);

  // Carol can read but not edit
  r = await fetch(`${base}/api/documents/${id}`, { headers: H('carol@ajaia.dev') });
  doc = await r.json();
  assert.strictEqual(doc.role, 'read');
  assert.ok(doc.content_html.includes('bob was here'));
  r = await fetch(`${base}/api/documents/${id}`, {
    method: 'PUT', headers: H('carol@ajaia.dev'),
    body: JSON.stringify({ content_html: '<p>nope</p>' }),
  });
  assert.strictEqual(r.status, 403);

  // Non-owners cannot share, revoke, delete, or list shares
  r = await fetch(`${base}/api/documents/${id}/share`, {
    method: 'POST', headers: H('bob@ajaia.dev'),
    body: JSON.stringify({ email: 'carol@ajaia.dev', role: 'read' }),
  });
  assert.strictEqual(r.status, 403);
  r = await fetch(`${base}/api/documents/${id}/shares`, { headers: H('bob@ajaia.dev') });
  assert.strictEqual(r.status, 403);
  r = await fetch(`${base}/api/documents/${id}`, { method: 'DELETE', headers: H('bob@ajaia.dev') });
  assert.strictEqual(r.status, 403);

  // Owner lists shares, then revokes Bob
  r = await fetch(`${base}/api/documents/${id}/shares`, { headers: H('alice@ajaia.dev') });
  const shares = await r.json();
  assert.strictEqual(shares.length, 2);
  const bobId = shares.find((s) => s.email === 'bob@ajaia.dev').id;
  r = await fetch(`${base}/api/documents/${id}/share/${bobId}`, { method: 'DELETE', headers: H('alice@ajaia.dev') });
  assert.strictEqual(r.status, 200);
  r = await fetch(`${base}/api/documents/${id}`, { headers: H('bob@ajaia.dev') });
  assert.strictEqual(r.status, 404);

  // Export works for readers (Carol) and returns Markdown
  r = await fetch(`${base}/api/documents/${id}/export`, { headers: H('carol@ajaia.dev') });
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/markdown/);
  const md = await r.text();
  assert.ok(md.includes('bob was here')); // Bob's edit replaced the original content

  // Owner deletes
  r = await fetch(`${base}/api/documents/${id}`, { method: 'DELETE', headers: H('alice@ajaia.dev') });
  assert.strictEqual(r.status, 200);
  r = await fetch(`${base}/api/documents/${id}`, { headers: H('alice@ajaia.dev') });
  assert.strictEqual(r.status, 404);
});

test('share validation: bad role, unknown user, self-share', async () => {
  let r = await fetch(`${base}/api/documents`, {
    method: 'POST', headers: H('alice@ajaia.dev'), body: JSON.stringify({ title: 'T' }),
  });
  const { id } = await r.json();

  r = await fetch(`${base}/api/documents/${id}/share`, {
    method: 'POST', headers: H('alice@ajaia.dev'),
    body: JSON.stringify({ email: 'bob@ajaia.dev', role: 'admin' }),
  });
  assert.strictEqual(r.status, 400);
  r = await fetch(`${base}/api/documents/${id}/share`, {
    method: 'POST', headers: H('alice@ajaia.dev'),
    body: JSON.stringify({ email: 'ghost@ajaia.dev', role: 'read' }),
  });
  assert.strictEqual(r.status, 404);
  r = await fetch(`${base}/api/documents/${id}/share`, {
    method: 'POST', headers: H('alice@ajaia.dev'),
    body: JSON.stringify({ email: 'alice@ajaia.dev', role: 'read' }),
  });
  assert.strictEqual(r.status, 400);
});

test('import endpoint accepts markdown and creates a document', async () => {
  const fd = new FormData();
  fd.append('file', new Blob(['# Imported\n\n- a\n- b'], { type: 'text/markdown' }), 'notes.md');
  const r = await fetch(`${base}/api/import`, {
    method: 'POST',
    headers: { Cookie: jar['alice@ajaia.dev'] },
    body: fd,
  });
  assert.strictEqual(r.status, 201);
  const { id } = await r.json();

  const doc = await (await fetch(`${base}/api/documents/${id}`, { headers: H('alice@ajaia.dev') })).json();
  assert.strictEqual(doc.title, 'notes');
  assert.ok(doc.content_html.includes('<h1>Imported</h1>'));
  assert.ok(doc.content_html.includes('<ul><li>a</li><li>b</li></ul>'));
});

test('import endpoint rejects unsupported types and missing files', async () => {
  const fd = new FormData();
  fd.append('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'doc.pdf');
  let r = await fetch(`${base}/api/import`, {
    method: 'POST',
    headers: { Cookie: jar['alice@ajaia.dev'] },
    body: fd,
  });
  assert.strictEqual(r.status, 400);
  const { error } = await r.json();
  assert.match(error, /Unsupported file type/);

  r = await fetch(`${base}/api/import`, {
    method: 'POST',
    headers: { Cookie: jar['alice@ajaia.dev'] },
  });
  assert.strictEqual(r.status, 400);
});

test('invalid document ids return 400, not 500', async () => {
  const r = await fetch(`${base}/api/documents/abc`, { headers: H('alice@ajaia.dev') });
  assert.strictEqual(r.status, 400);
});
