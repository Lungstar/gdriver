# AI Workflow Note

## Tools used

- **GitHub Copilot (agent mode in VS Code)** — initial full-stack draft, then
  iterative hardening, test authoring, and end-to-end verification.
- No code was merged without being run: every claim below was checked against
  the running server or the test suite.

## Where AI materially sped things up

- **Scaffolding velocity**: first working version of all 10 files (schema, API,
  SPA, tests) came out of one generation pass — easily 2–3 hours of typing saved.
- **The Markdown↔HTML converters**: tedious, regex-heavy, and well-suited to AI
  generation *because* they're pure functions I could pin down with unit tests.
- **Test breadth**: AI drafted the HTTP integration suite (cookie jars, sharing
  matrix). Having 19 tests generated in minutes changed what I could afford to
  verify.

## What I changed or rejected — and why

The first AI draft looked plausible but had real defects. Reviewing it as a
skeptic, not a consumer, was the core of my workflow:

| AI output | Problem found | Action |
|---|---|---|
| `multer@^1.4.5-lts.1` | 1.x line has known CVEs | Upgraded to `multer@^2.x` |
| Sanitizer allowlist without `<b>`/`<i>`/`<div>` | Chrome/Firefox `execCommand` emits exactly those tags — formatting would be **silently stripped on save** | Added `transformTags` normalization (`b→strong`, `i→em`, `div→p`) + regression test |
| Save-on-`beforeunload` | Async `fetch` during unload is cancelled by the browser — the "safety net" didn't work | Replaced with `keepalive: true` flush on `visibilitychange`/`pagehide` |
| Share panel refreshed by clicking its own toggle twice | Worked by accident, unreadable | Rewrote as an explicit `renderSharePanel()` re-fetch/render |
| No deployment story at all | Hard requirement of the assignment | Added Dockerfile, fly.toml, render.yaml, and an honest free-tier-ephemerality note |
| Suggested "just use `node:sqlite`" (built-in) | Experimental flag warnings in production logs; support varies by host | Rejected — stayed with `better-sqlite3` prebuilds |
| `alert()` for errors | Poor UX, blocks the thread | Toast notifications with error-envelope messages from the API |

Two bugs were found **by testing, not by reading** — which is the point of the
next section:

- The Markdown export test asserted content that an earlier step in the same
  test had already overwritten. AI wrote both the bug and the test; running it
  caught the inconsistency.
- A browser smoke test showed the Share button and toolbar visible to a
  read-only user: component CSS (`display: flex/inline-block`) was overriding
  the `hidden` attribute. Fixed with `[hidden] { display: none !important; }`.

## How correctness was verified

1. **Automated**: `npm test` — 19 tests across three suites: access-rule unit
   tests, content-pipeline tests (including XSS payloads and CRLF edge cases),
   and HTTP integration tests that run the entire sharing matrix (create →
   sanitize → share → edit-as-collaborator → 403-as-viewer → revoke → 404).
2. **Manual API pass**: the same flows re-run with `curl.exe` and cookie jars,
   including a hand-built minimal `.docx` to prove the mammoth path.
3. **Browser pass**: real Chromium — login picker, dashboard, editing with
   autosave confirmed by re-fetching from the server, share panel, and the
   read-only view (which is how the `hidden`-attribute bug was caught).
4. **XSS spot checks**: `<script>`, `onerror=`, and `onclick=` payloads through
   both the editor save path and the Markdown import path; verified stripped in
   stored output.

## Honest assessment

AI generated ~90% of the initial code and ~100% of the first test draft. My
judgment went into: choosing the scope cuts, catching the dependency CVE,
recognizing the `execCommand` markup-normalization issue, insisting on a
deployment story, and designing the verification loop that found the remaining
bugs. The tool was fast; the review and verification are what made it shippable.
