const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT 'Untitled',
    content_html TEXT NOT NULL DEFAULT '',
    owner_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS access (
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK(role IN ('read','edit')),
    PRIMARY KEY (document_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id)
  );
`);

const DEMO_USERS = [
  ['alice@ajaia.dev', 'Alice'],
  ['bob@ajaia.dev', 'Bob'],
  ['carol@ajaia.dev', 'Carol'],
];

function seedUsers() {
  const ins = db.prepare('INSERT OR IGNORE INTO users (email, name) VALUES (?, ?)');
  for (const u of DEMO_USERS) ins.run(...u);
}

// Zero-config demo: a fresh deployment seeds itself so reviewers can log in immediately.
function seedIfEmpty() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (n === 0) {
    seedUsers();
    return true;
  }
  return false;
}

if (require.main === module && process.argv[2] === 'seed') {
  seedUsers();
  console.log('Seeded demo users: alice@ajaia.dev, bob@ajaia.dev, carol@ajaia.dev');
}

module.exports = db;
module.exports.seedUsers = seedUsers;
module.exports.seedIfEmpty = seedIfEmpty;
