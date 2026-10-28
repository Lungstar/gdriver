const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const tmp = path.join(os.tmpdir(), `ajaia-access-test-${process.pid}.db`);
process.env.DB_PATH = tmp;

const db = require('../server/db');
const { roleFor, canEdit, listForUser } = require('../server/documents');

test.after(() => {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(tmp + suffix); } catch { /* ignore */ }
  }
});

function makeUser(email, name) {
  db.prepare('INSERT OR IGNORE INTO users (email, name) VALUES (?, ?)').run(email, name);
  return db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
}

function makeDoc(ownerId, title = 'Doc') {
  return db.prepare('INSERT INTO documents (title, owner_id) VALUES (?, ?)').run(title, ownerId).lastInsertRowid;
}

test('owner resolves to owner role and can edit', () => {
  const owner = makeUser('owner@test.dev', 'Owner');
  const docId = makeDoc(owner);
  assert.strictEqual(roleFor(docId, owner), 'owner');
  assert.ok(canEdit('owner'));
});

test('shared edit user can edit, read-only user cannot', () => {
  const owner = makeUser('owner2@test.dev', 'Owner2');
  const editor = makeUser('editor@test.dev', 'Editor');
  const viewer = makeUser('viewer@test.dev', 'Viewer');
  const docId = makeDoc(owner);
  db.prepare('INSERT INTO access (document_id, user_id, role) VALUES (?, ?, ?)').run(docId, editor, 'edit');
  db.prepare('INSERT INTO access (document_id, user_id, role) VALUES (?, ?, ?)').run(docId, viewer, 'read');

  assert.strictEqual(roleFor(docId, editor), 'edit');
  assert.ok(canEdit('edit'));
  assert.strictEqual(roleFor(docId, viewer), 'read');
  assert.ok(!canEdit('read'));
});

test('user without a grant has no role', () => {
  const owner = makeUser('owner3@test.dev', 'Owner3');
  const outsider = makeUser('outsider@test.dev', 'Outsider');
  const docId = makeDoc(owner);
  assert.strictEqual(roleFor(docId, outsider), null);
});

test('listForUser separates owned and shared documents', () => {
  const owner = makeUser('owner4@test.dev', 'Owner4');
  const friend = makeUser('friend@test.dev', 'Friend');
  const ownDoc = makeDoc(owner, 'Mine');
  const sharedDoc = makeDoc(friend, 'Theirs');
  db.prepare('INSERT INTO access (document_id, user_id, role) VALUES (?, ?, ?)').run(sharedDoc, owner, 'read');

  const { owned, shared } = listForUser(owner);
  assert.ok(owned.some((d) => d.id === ownDoc));
  assert.ok(shared.some((d) => d.id === sharedDoc && d.owner_name === 'Friend'));
  assert.ok(!owned.some((d) => d.id === sharedDoc));
});
