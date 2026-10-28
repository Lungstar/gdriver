# Screenshots — Ajaia Docs walkthrough

Captured against the live deployment
(https://thespian-deletion-amino.ngrok-free.dev) on 2026-10-28.

| File | What it shows |
|---|---|
| `01-login-picker.png` | Seeded demo-account picker (no passwords) |
| `02-dashboard-alice.png` | Alice's dashboard — My documents / Shared with me, Import + New document |
| `03-editor-formatted-autosaved.png` | Editor with H1, bold, italic, underline, bulleted & numbered lists; "Saved …" autosave status after reload (formatting persisted) |
| `04-share-panel.png` | Share panel: Bob added as **Can edit**, Carol as **View only** |
| `05-bob-shared-with-me.png` | Bob's dashboard — doc under "Shared with me" with owner name and Can edit badge |
| `06-bob-editing.png` | Bob editing the shared doc (toolbar available, Share button hidden — owner-only) |
| `07-carol-view-only-dashboard.png` | Carol's dashboard — same doc with **View only** badge |
| `08-carol-read-only-editor.png` | Read-only enforcement: banner, toolbar hidden, title disabled; Bob's edit visible |
| `09-imported-markdown.png` | `demo-import.md` imported via the UI — headings, bold/italic, lists converted |

Server-side enforcement verified over the public URL (same session):

- `PUT /api/documents/2` as Carol (view-only) → **HTTP 403**
- `GET /api/documents/2` anonymous → **HTTP 401**

## Demo files

- `demo-import.md` — the Markdown file used for the import demo
- `exported-roundtrip.md` — the result of **Export .md** on that imported
  document; byte-equivalent round-trip (headings, lists, bold/italic preserved)
