const crypto = require('crypto');
const db = require('./db');

function createSession(userId) {
  const sid = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (sid, user_id) VALUES (?, ?)').run(sid, userId);
  return sid;
}

function getUserBySid(sid) {
  if (!sid) return null;
  return db.prepare(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.sid = ?'
  ).get(sid) || null;
}

function requireUser(req, res, next) {
  const user = getUserBySid(req.cookies && req.cookies.sid);
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  req.user = user;
  next();
}

module.exports = { createSession, getUserBySid, requireUser };
