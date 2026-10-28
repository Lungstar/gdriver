# Ajaia Docs — Lightweight Collaborative Document Editor

A small full-stack, Google Docs-inspired editor built in a 4–6 hour timebox.
Rich-text editing with autosave, file import (`.txt` / `.md` / `.docx`), sharing
with read/edit roles, Markdown export, and SQLite persistence.

## Live demo

**https://gdriver-lnc7.onrender.com**

Hosted on Render (Docker). Free plan: the service sleeps when idle, so the
first load may take ~30–60 s to wake. The three demo accounts below are seeded
automatically — just pick one from the login screen.

## Quickstart

```bash
npm install
npm run dev        # http://localhost:3000  (demo users auto-seed on first run)
npm test           # 19 automated tests (unit + HTTP integration)
```

No other setup needed — a fresh database seeds itself with demo accounts.

## Demo accounts (no passwords — user picker)

| Email | Suggested role in the demo |
|---|---|
| `alice@ajaia.dev` | Document owner |
| `bob@ajaia.dev` | Collaborator (Can edit) |
| `carol@ajaia.dev` | Recipient (View only) |

## Demo flow (sharing, end to end)

1. Sign in as **Alice** → **+ New document**.
2. Format text with the toolbar (**B** / *I* / <u>U</u>, headings, lists). Autosave kicks in after ~0.7 s ("Saving…" → "Saved …").
3. Refresh the page — content and formatting persist.
4. **Share** → add `bob@ajaia.dev` as *Can edit*, `carol@ajaia.dev` as *View only*.
5. Log out → sign in as **Bob**: the doc appears under **Shared with me**, fully editable.
6. Sign in as **Carol**: same doc is visible with a *View only* badge — toolbar hidden, title disabled, saves rejected server-side (403).
7. **Import file** (dashboard) turns a `.txt`, `.md`, or `.docx` into a new editable document.
8. **Export .md** (editor header) downloads the document as Markdown.

## Supported file types

- `.txt` — each line becomes a paragraph
- `.md` — headings (`#`–`###`), `-`/`1.` lists, `**bold**`, `_italic_`
- `.docx` — converted via [mammoth](https://www.npmjs.com/package/mammoth), then reduced to the supported subset
- Max size: **2 MB**. Anything else is rejected with a clear error.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `npm start` | Start the server (port `PORT`, default 3000) |
| `npm run seed` | Re-seed demo users (idempotent) |
| `npm test` | Run the test suite |

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `./data.db` | SQLite file location (set to `/data/ajaia.db` when using a volume) |

## Deployment

**This app is deployed on Render:** https://gdriver-lnc7.onrender.com (Docker
web service built from this repo via the included `render.yaml` blueprint).

The app is a single Node process serving both the API and the client — deploy it
anywhere Docker or Node runs. Configs are included:

- **Render (current host):** `render.yaml` blueprint included (works on free
  **and** paid plans). The app uses `DB_PATH=/data/ajaia.db` when a persistent
  disk is mounted there (paid), and automatically falls back to an ephemeral
  local file when `/data` isn't writable (free) — so it deploys cleanly either
  way. On the free tier the DB resets on restart and re-seeds the demo users on
  each boot. To add persistence later: Dashboard → your service → Disks → Add
  Disk at `/data` (no code change needed).
- **Fly.io (alternative free path, real persistence):**
  ```bash
  fly launch --no-deploy        # adopts fly.toml
  fly volumes create ajaia_data --size 1
  fly deploy
  ```
- **Any Docker host:**
  ```bash
  docker build -t ajaia-docs .
  docker run -p 3000:3000 -v ajaia-data:/data ajaia-docs
  ```

The server auto-seeds the three demo users when the database is empty, so a
fresh deployment is immediately reviewable. Health check: `GET /api/health`.

## Project structure

```
client/          Vanilla-JS SPA (login picker, dashboard, editor, share panel)
server/
  index.js       Entry point (auto-seed + listen)
  app.js         Express app: routes, validation, security headers, errors
  db.js          SQLite schema + seed
  auth.js        Cookie sessions
  documents.js   Access resolution (roleFor) — single source of truth
  import.js      .txt/.md/.docx → sanitized HTML
  export.js      sanitized HTML → Markdown (stretch feature)
tests/           node:test suites (access rules, content pipeline, HTTP API)
```

## Intentional scope cuts

- **No real-time collaboration** (no CRDT/OT, presence, or live cursors) — would consume the whole timebox.
- **No password auth** — seeded user picker keeps the focus on the product surface; sessions are httpOnly cookies.
- **No version history, comments, or PDF export** — Markdown export included as the one stretch item.
- **`document.execCommand`** powers the toolbar: deprecated, but still the only universally supported contenteditable API. Migration path to TipTap/ProseMirror is documented in `ARCHITECTURE.md`.

See `ARCHITECTURE.md` for the design details and `AI-NOTES.md` for the AI-assisted workflow account.
