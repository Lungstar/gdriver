const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');

// Content pipeline tests don't touch the DB, but import.js pulls in the module
// graph cleanly on its own; set DB_PATH anyway so a stray require can't create
// a data.db in the repo root during tests.
process.env.DB_PATH = path.join(os.tmpdir(), `ajaia-content-test-${process.pid}.db`);

const { importFile, sanitizeContent, mdToHtml } = require('../server/import');
const { htmlToMarkdown } = require('../server/export');

test('sanitizer strips scripts, event handlers, and disallowed tags', () => {
  const out = sanitizeContent('<p onclick="x()">hi</p><script>alert(1)</script><img src=x onerror=alert(1)>');
  assert.ok(!out.includes('onclick'));
  assert.ok(!out.includes('<script'));
  assert.ok(!out.includes('onerror'));
  assert.ok(!out.includes('<img'));
  assert.ok(out.includes('hi'));
});

test('sanitizer normalizes browser contenteditable output instead of stripping it', () => {
  // Chrome/Firefox emit <b>/<i> for bold/italic and <div> for new lines.
  const out = sanitizeContent('<div>line one</div><div><b>bold</b> <i>ital</i></div>');
  assert.ok(out.includes('<p>line one</p>'));
  assert.ok(out.includes('<strong>bold</strong>'));
  assert.ok(out.includes('<em>ital</em>'));
});

test('markdown import produces headings, lists, and inline formatting', async () => {
  const html = await importFile(
    Buffer.from('# Title\n\n- one\n- two\n\n1. first\n2. second\n\n**bold** and _em_'),
    'text/markdown',
    'notes.md'
  );
  assert.ok(html.includes('<h1>Title</h1>'));
  assert.ok(html.includes('<ul><li>one</li><li>two</li></ul>'));
  assert.ok(html.includes('<ol><li>first</li><li>second</li></ol>'));
  assert.ok(html.includes('<strong>bold</strong>'));
  assert.ok(html.includes('<em>em</em>'));
});

test('markdown import escapes raw HTML in the source', async () => {
  const html = await importFile(Buffer.from('# <script>alert(1)</script>'), 'text/markdown', 'evil.md');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('txt import wraps lines in paragraphs and escapes HTML', async () => {
  const html = await importFile(Buffer.from('hello\n<b>world</b>'), 'text/plain', 'note.txt');
  assert.ok(html.includes('<p>hello</p>'));
  assert.ok(html.includes('&lt;b&gt;world&lt;/b&gt;'));
});

test('unsupported file types are rejected with a clear message', async () => {
  await assert.rejects(
    () => importFile(Buffer.from('x'), 'application/pdf', 'doc.pdf'),
    /Unsupported file type/
  );
});

test('markdown export round-trips the supported subset', () => {
  const html = '<h1>Title</h1><p>Some <strong>bold</strong> and <em>em</em> and <u>under</u>.</p><ul><li>one</li><li>two</li></ul><ol><li>a</li><li>b</li></ol>';
  const md = htmlToMarkdown(html);
  assert.ok(md.includes('# Title'));
  assert.ok(md.includes('**bold**'));
  assert.ok(md.includes('_em_'));
  assert.ok(md.includes('under')); // underline degrades to plain text
  assert.ok(md.includes('- one'));
  assert.ok(md.includes('- two'));
  assert.ok(md.includes('1. a'));
  assert.ok(md.includes('2. b'));
  assert.ok(!md.includes('<'));
});

test('mdToHtml handles CRLF line endings', () => {
  const html = mdToHtml('# T\r\n\r\n- a\r\n- b');
  assert.ok(html.includes('<h1>T</h1>'));
  assert.ok(html.includes('<ul><li>a</li><li>b</li></ul>'));
});
