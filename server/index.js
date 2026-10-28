const db = require('./db');
const { createApp } = require('./app');

if (db.seedIfEmpty()) {
  console.log('Fresh database — seeded demo users: alice@ajaia.dev, bob@ajaia.dev, carol@ajaia.dev');
}

const PORT = process.env.PORT || 3000;
createApp().listen(PORT, () => console.log(`Ajaia Docs running at http://localhost:${PORT}`));
