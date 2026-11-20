/**
 * Small, safe Markdown → HTML renderer for the editor preview. Mirrors what the site allows
 * (src/lib/remark-safe-markdown.ts): headings, bold, italic, lists, quotes, links (https, mailto, relative).
 * Every character of the source is escaped first; raw HTML is never rendered.
 */
function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeHref(href: string): string | null {
  const value = href.trim();
  if (/^(https:\/\/|mailto:|\/(?!\/)|#)/i.test(value)) return value;
  return null;
}

function inline(text: string): string {
  let out = escape(text);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    const url = safeHref(href.replace(/&amp;/g, '&'));
    return url ? `<a href="${escape(url)}" rel="noopener noreferrer">${label}</a>` : label;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  out = out.replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, '$1<em>$2</em>');
  return out;
}

export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let paragraph: string[] = [];
  let quote: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) html.push(`</${list}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) html.push(`<blockquote><p>${quote.map(inline).join('<br>')}</p></blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushAll();
      continue;
    }
    const heading = /^(#{2,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushAll();
      const level = heading[1]?.length ?? 2;
      html.push(`<h${level}>${inline(heading[2] ?? '')}</h${level}>`);
      continue;
    }
    if (trimmed.startsWith('>')) {
      flushParagraph();
      flushList();
      quote.push(trimmed.replace(/^>\s?/, ''));
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      flushParagraph();
      flushQuote();
      const kind = bullet ? 'ul' : 'ol';
      if (list !== kind) {
        flushList();
        html.push(`<${kind}>`);
        list = kind;
      }
      html.push(`<li>${inline((bullet ?? numbered)?.[1] ?? '')}</li>`);
      continue;
    }
    flushList();
    flushQuote();
    paragraph.push(trimmed);
  }
  flushAll();
  return html.join('\n');
}
