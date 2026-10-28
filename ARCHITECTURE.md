# Architecture Note — Ajaia Docs

## What I prioritized and why

The assignment rewards a coherent product slice over feature breadth, so I
optimized for three things, in order:

1. **A trustworthy core loop** — create → edit → autosave → reopen, with
   formatting intact. If this is shaky, nothing else matters.
2. **A sharing model with real teeth** — not just a UI gesture: one access
   resolver enforced on every route, with server-side 403s a reviewer can
   verify with curl.
3. **Safe persistence of user HTML** — storing rich text means storing HTML,
   which means XSS risk. Everything written to the database passes through a
   strict allowlist sanitizer.

Depth in those three areas was chosen over shallow coverage of comments,
history, or realtime collaboration.

## Shape

Single Node process, no build step:

```
Browser (vanilla JS SPA, contenteditable)
   │  fetch /api/* (JSON, httpOnly cookie session)
   ▼
Express app ── sanitize-html allowlist on every write
   │
   ▼
better-sqlite3 (WAL mode) — users, documents, access, sessions
```

Why this shape: zero build tooling to break under time pressure, one deployable
unit, a database file a reviewer can inspect, and a dependency footprint small
enough to audit. The tradeoff is horizontal scale — acceptable for a demo, and
the data layer is isolated enough (`db.js`, `documents.js`) to swap for
Postgres without touching routes.

## Data model

```
users(id, email, name)
documents(id, title, content_html, owner_id, created_at, updated_at)
access(document_id, user_id, role CHECK role IN ('read','edit'))  PK(document_id, user_id)
sessions(sid, user_id)
```

## Access control

One function, `roleFor(docId, userId) → 'owner' | 'edit' | 'read' | null`, is
the single source of truth. Every document route resolves it first:

- `GET` / export: any non-null role
- `PUT`: `owner` or `edit` (403 otherwise — enforced server-side, not just hidden in the UI)
- `share` / `revoke` / `shares` / `DELETE`: `owner` only
- Non-members get **404, not 403**, so document existence isn't leaked.

The client mirrors these rules (toolbar hidden, title disabled, Share button
owner-only) but the server is the enforcement point; the UI is just honest
about it.

## Content pipeline

**Write path:** `contenteditable` innerHTML → 700 ms debounced autosave →
`sanitize-html` allowlist (`p, br, strong, em, u, h1–h3, ul, ol, li`) → SQLite.
A flush with `fetch(..., { keepalive: true })` on `visibilitychange`/`pagehide`
covers tab closes that would otherwise lose the last keystrokes.

**Browser normalization:** Chrome/Firefox emit `<b>`, `<i>`, and `<div>` line
breaks from `execCommand`. The sanitizer *transforms* these (`b→strong`,
`i→em`, `div→p`) instead of stripping them — an early version stripped them and
silently ate formatting on reload; there is a regression test for this.

**Import:** `.txt` (lines → paragraphs), `.md` (small hand-rolled parser for
the supported subset), `.docx` (mammoth → HTML → same allowlist). All paths
converge on `sanitizeContent`, so import can't smuggle markup the editor
wouldn't produce.

**Export (stretch):** the inverse mapping for the same subset. Underline has no
Markdown equivalent and degrades to plain text — stated in the test.

## Key tradeoffs

| Decision | Tradeoff accepted | Migration path |
|---|---|---|
| `document.execCommand` toolbar | Deprecated API; inconsistent markup across browsers (handled by sanitizer normalization) | Swap editor surface for TipTap/ProseMirror; the sanitized-HTML storage format stays valid |
| Seeded user picker, no passwords | Not real auth; `/api/users` exposes the directory | Drop-in: replace `/api/login` with password or OAuth; sessions/access model unchanged |
| SQLite file | Single-writer, ephemeral on some free hosts | `DB_PATH` + volume (fly.toml included); or port `db.js` to Postgres — queries are simple |
| Sessions in DB table | Logout-all requires row deletes | Fine at demo scale |
| In-memory login rate limit (30/min/IP) | Resets on restart, per-instance | Redis-backed limiter behind a proxy |

## Security notes

- httpOnly + SameSite=Lax session cookies; JSON-only API (no CSRF surface worth a token at this scope).
- CSP `default-src 'self'` — no inline scripts anywhere in the client; all DOM wiring is via `addEventListener`/`on*`.
- All user-controlled strings rendered into HTML pass through an `esc()` helper; document HTML is server-sanitized before storage.
- Uploads: memory-only (never touch disk), 2 MB cap, single file, extension/MIME checked, errors mapped to 400/413.
- IDs validated as integers on every parameterized route (400, not 500).

## What I'd build with another 2–4 hours

1. **Version history** — the schema is one table away (`document_versions`), and it demos well.
2. **Presence-lite** — SSE channel broadcasting "Bob is viewing" without full CRDT.
3. **Real auth** — magic-link email; the session/access layers wouldn't change.
