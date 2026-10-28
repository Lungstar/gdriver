const sanitizeHtml = require('sanitize-html');
const mammoth = require('mammoth');

// Allowlist for everything that can be persisted. contenteditable output varies
// by browser (Chrome/Firefox emit <b>/<i> and <div> line breaks), so those tags
// are normalized to canonical forms instead of being stripped.
const ALLOWED = {
  allowedTags: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'b', 'i', 'div'],
  allowedAttributes: {},
  transformTags: {
    b: 'strong',
    i: 'em',
    div: 'p',
  },
};

function sanitizeContent(html) {
  return sanitizeHtml(String(html || ''), ALLOWED);
}

function inlineMd(s) {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1<em>$2</em>');
}

function mdToHtml(md) {
  const lines = md.split(/\r?\n/);
  let html = '';
  let inList = null;
  const closeList = () => { if (inList) { html += `</${inList}>`; inList = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      closeList();
      html += `<h${m[1].length}>${inlineMd(m[2])}</h${m[1].length}>`;
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      if (inList !== 'ul') { closeList(); html += '<ul>'; inList = 'ul'; }
      html += `<li>${inlineMd(m[1])}</li>`;
    } else if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
      if (inList !== 'ol') { closeList(); html += '<ol>'; inList = 'ol'; }
      html += `<li>${inlineMd(m[1])}</li>`;
    } else if (line === '') {
      closeList();
    } else {
      closeList();
      html += `<p>${inlineMd(line)}</p>`;
    }
  }
  closeList();
  return sanitizeContent(html);
}

function txtToHtml(text) {
  const esc = (l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text.split(/\r?\n/).map((l) => `<p>${esc(l)}</p>`).join('');
}

async function importFile(buffer, mimetype, filename) {
  const name = filename || '';
  if (/\.docx$/i.test(name) || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const { value } = await mammoth.convertToHtml({ buffer });
    return sanitizeContent(value);
  }
  const text = buffer.toString('utf8');
  if (/\.md$/i.test(name) || mimetype === 'text/markdown') return mdToHtml(text);
  if (/\.txt$/i.test(name) || mimetype === 'text/plain') return sanitizeContent(txtToHtml(text));
  throw new Error('Unsupported file type. Upload .txt, .md, or .docx');
}

module.exports = { importFile, sanitizeContent, mdToHtml };
