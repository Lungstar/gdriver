// Stretch feature: export a document to Markdown.
// Input is always our sanitized HTML subset (p, h1-3, strong, em, u, ul/ol/li, br),
// so a small targeted converter is sufficient — no general-purpose HTML parser needed.

function inlineMd(s) {
  return s
    .replace(/<br\s*\/?>/gi, '  \n')
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<em>([\s\S]*?)<\/em>/gi, '_$1_')
    .replace(/<u>([\s\S]*?)<\/u>/gi, '$1') // Markdown has no underline; keep the text
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function htmlToMarkdown(html) {
  const out = String(html || '')
    .replace(/<h([1-3])>([\s\S]*?)<\/h\1>/gi, (_, n, c) => `${'#'.repeat(Number(n))} ${inlineMd(c)}\n\n`)
    .replace(/<ul>([\s\S]*?)<\/ul>/gi, (_, c) =>
      c.replace(/<li>([\s\S]*?)<\/li>/gi, (__, li) => `- ${inlineMd(li)}\n`) + '\n')
    .replace(/<ol>([\s\S]*?)<\/ol>/gi, (_, c) => {
      let i = 0;
      return c.replace(/<li>([\s\S]*?)<\/li>/gi, (__, li) => `${++i}. ${inlineMd(li)}\n`) + '\n';
    })
    .replace(/<p>([\s\S]*?)<\/p>/gi, (_, c) => {
      const t = inlineMd(c).trim();
      return t ? `${t}\n\n` : '';
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ''); // drop anything unexpected rather than leaking tags

  return out.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

module.exports = { htmlToMarkdown };
