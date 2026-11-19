/**
 * Markdown safety for a public site.
 *
 * Content comes from editors (Decap CMS) and from Facebook posts (step 5). Raw HTML inside Markdown
 * would otherwise be rendered as-is, so the Markdown tree is cleaned before HTML is produced:
 * - raw HTML nodes are removed (<iframe>, <form>, <script>, <meta http-equiv>, inline styles, comments…);
 * - links with a non-allowed protocol (javascript:, data:, vbscript:…) become plain text;
 * - images written inside the body are removed: images must go through the frontmatter `images` field,
 *   which requires alt text and is processed by Astro (resized, WebP, metadata stripped).
 *
 * `safeMarkdownPlugin` is the Sätteri (Astro 7 default processor) plugin used in astro.config.mjs.
 * `cleanMarkdownTree` applies the same rules to a plain mdast tree (unit tests).
 */

interface MdNode {
  type: string;
  url?: string;
  children?: MdNode[];
  value?: string;
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const DROPPED_TYPES = new Set(['html', 'image', 'imageReference']);

/** True for relative URLs, fragments and allowed absolute protocols. */
export function isSafeUrl(url: string): boolean {
  // Control characters and whitespace can hide a protocol ("java\tscript:").
  // eslint-disable-next-line no-control-regex
  const compact = url.replace(/[\u0000- \u007f]/g, '');
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(compact);
  if (!match) return true; // relative path, "#anchor", "/path", "?query"
  return ALLOWED_PROTOCOLS.has(`${match[1]?.toLowerCase()}:`);
}

/** Applies the safety rules to a plain mdast tree, in place. */
export function cleanMarkdownTree(node: MdNode): void {
  if (!node.children) return;
  const result: MdNode[] = [];
  for (const child of node.children) {
    if (DROPPED_TYPES.has(child.type)) continue;
    if ((child.type === 'link' || child.type === 'definition') && child.url !== undefined && !isSafeUrl(child.url)) {
      if (child.type === 'link') result.push(...(child.children ?? []));
      continue;
    }
    cleanMarkdownTree(child);
    result.push(child);
  }
  node.children = result;
}

// Minimal structural types for the Sätteri visitor context (the full types live in the `satteri` package).
interface VisitorContext {
  removeNode(node: unknown): void;
  replaceNode(node: unknown, replacement: unknown): void;
}
type UrlNode = { url: string; children?: unknown[] };

/** Sätteri mdast plugin with the same rules as `cleanMarkdownTree`. */
export const safeMarkdownPlugin = {
  name: 'infspm-safe-markdown',
  html(node: unknown, ctx: VisitorContext) {
    ctx.removeNode(node);
  },
  image(node: unknown, ctx: VisitorContext) {
    ctx.removeNode(node);
  },
  imageReference(node: unknown, ctx: VisitorContext) {
    ctx.removeNode(node);
  },
  definition(node: UrlNode, ctx: VisitorContext) {
    if (!isSafeUrl(node.url)) ctx.removeNode(node);
  },
  link(node: UrlNode, ctx: VisitorContext) {
    if (!isSafeUrl(node.url)) ctx.replaceNode(node, [...(node.children ?? [])]);
  },
};
