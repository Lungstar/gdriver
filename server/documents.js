const db = require('./db');

// Single source of truth for access resolution: 'owner' | 'edit' | 'read' | null.
// Every document route authorizes through this function.
function roleFor(docId, userId) {
  const doc = db.prepare('SELECT owner_id FROM documents WHERE id = ?').get(docId);
  if (!doc) return null;
  if (doc.owner_id === userId) return 'owner';
  const grant = db.prepare('SELECT role FROM access WHERE document_id = ? AND user_id = ?').get(docId, userId);
  return grant ? grant.role : null;
}

function canEdit(role) {
  return role === 'owner' || role === 'edit';
}

function listForUser(userId) {
  const owned = db.prepare(
    `SELECT id, title, updated_at, 'owner' AS role FROM documents WHERE owner_id = ? ORDER BY updated_at DESC`
  ).all(userId);
  const shared = db.prepare(
    `SELECT d.id, d.title, d.updated_at, a.role, u.name AS owner_name
     FROM documents d
     JOIN access a ON a.document_id = d.id
     JOIN users u ON u.id = d.owner_id
     WHERE a.user_id = ? ORDER BY d.updated_at DESC`
  ).all(userId);
  return { owned, shared };
}

module.exports = { roleFor, canEdit, listForUser };
