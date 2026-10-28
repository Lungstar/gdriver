# Submission — Ajaia Docs

## Contents of this folder

| Item | File(s) |
|---|---|
| Source code | `server/`, `client/`, `tests/`, `package.json` |
| README with setup & run instructions | `README.md` |
| Architecture note | `ARCHITECTURE.md` |
| AI workflow note | `AI-NOTES.md` |
| This manifest | `SUBMISSION.md` |
| Walkthrough video link | `VIDEO-URL.txt` |
| Deployment configs | `Dockerfile`, `.dockerignore`, `fly.toml`, `render.yaml` |
| Screenshots + demo files | `screenshots/` |

## Live deployment

**URL:** https://gdriver-lnc7.onrender.com

Hosted on **Render** (Docker web service built from the GitHub repo). Free plan:
the service sleeps after inactivity, so the **first request may take ~30–60 s**
to wake — subsequent loads are fast. The SQLite DB is ephemeral on this tier
(resets on restart) and re-seeds the three demo users on each boot. Health
check: `GET /api/health`.

The deployment auto-seeds demo users on first boot; no setup steps are needed
beyond opening the URL.

## Test accounts (seeded, no passwords — pick from the login screen)

- `alice@ajaia.dev` — use as the document **owner**
- `bob@ajaia.dev` — share target with **Can edit**
- `carol@ajaia.dev` — share target with **View only**

## Run locally

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 19 tests
```

## Status

**Working end to end:**
- Document create / rename / edit / autosave / reopen (formatting preserved)
- Rich text: bold, italic, underline, H1–H3, bulleted & numbered lists
- Import `.txt` / `.md` / `.docx` (2 MB cap, types stated in UI) → new document
- Sharing with read/edit roles, revoke, owner-only share/delete, 404 for non-members
- Owned vs. shared sections with role badges and owner names
- Read-only enforcement in UI *and* server (403 verified)
- Markdown export (stretch)
- 19 automated tests; security headers; sanitized storage; rate-limited login

**Intentionally incomplete:** realtime collaboration, presence, comments,
version history, password auth, PDF export.

**With another 2–4 hours:** version history (one table away), presence-lite via
SSE, magic-link auth. Rationale in `ARCHITECTURE.md`.
