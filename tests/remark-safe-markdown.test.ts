import { describe, expect, it } from 'vitest';
import { cleanMarkdownTree, isSafeUrl, safeMarkdownPlugin } from '~/lib/remark-safe-markdown';

type Node = { type: string; url?: string; value?: string; children?: Node[] };

function run(children: Node[]): Node {
  const tree: Node = { type: 'root', children };
  cleanMarkdownTree(tree);
  return tree;
}

describe('isSafeUrl', () => {
  it.each(['https://example.org', 'http://x.dz', 'mailto:a@b.dz', 'tel:+213', '/fr/news/', '#top', 'page/', '?q=1'])(
    'allows %s',
    (url) => expect(isSafeUrl(url)).toBe(true),
  );
  it.each(['javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' javascript:x', 'java\tscript:x', 'data:text/html,x', 'vbscript:x', 'file:///etc/passwd'])(
    'blocks %s',
    (url) => expect(isSafeUrl(url)).toBe(false),
  );
});

describe('cleanMarkdownTree', () => {
  it('removes raw HTML nodes at any depth', () => {
    const tree = run([
      { type: 'html', value: '<iframe src="https://evil.example"></iframe>' },
      { type: 'paragraph', children: [{ type: 'text', value: 'ok' }, { type: 'html', value: '<img src=x onerror=alert(1)>' }] },
    ]);
    expect(JSON.stringify(tree)).not.toContain('iframe');
    expect(JSON.stringify(tree)).not.toContain('onerror');
    expect(JSON.stringify(tree)).toContain('ok');
  });

  it('unwraps links with unsafe protocols but keeps their text', () => {
    const tree = run([
      {
        type: 'paragraph',
        children: [
          { type: 'link', url: 'javascript:alert(1)', children: [{ type: 'text', value: 'click' }] },
          { type: 'link', url: 'https://example.org', children: [{ type: 'text', value: 'safe' }] },
        ],
      },
    ]);
    const json = JSON.stringify(tree);
    expect(json).not.toContain('javascript:');
    expect(json).toContain('click');
    expect(json).toContain('https://example.org');
  });

  it('removes images from the body and unsafe link definitions', () => {
    const tree = run([
      { type: 'paragraph', children: [{ type: 'image', url: 'https://scontent.fbcdn.net/x.jpg' }] },
      { type: 'definition', url: 'javascript:alert(1)' },
    ]);
    const json = JSON.stringify(tree);
    expect(json).not.toContain('fbcdn');
    expect(json).not.toContain('javascript:');
  });
});

describe('Sätteri pipeline (as used by the Astro build)', () => {
  it('renders dangerous Markdown safely', async () => {
    const { markdownToHtml } = await import('satteri');
    const source = [
      'Hello <iframe src="https://evil.example"></iframe> world',
      '',
      '<script>alert(1)</script>',
      '',
      '<meta http-equiv="refresh" content="0;url=https://evil.example">',
      '',
      '[click](javascript:alert(1)) and [ok](https://example.org)',
      '',
      '![photo](https://scontent.fbcdn.net/x.jpg)',
      '',
      '[ref]: javascript:alert(2)',
    ].join('\n');
    const result = await markdownToHtml(source, { mdastPlugins: [safeMarkdownPlugin] as never });
    const html = typeof result === 'string' ? result : result.html;
    for (const bad of ['<iframe', '<script', '<meta', 'javascript:', 'fbcdn', '<img']) expect(html).not.toContain(bad);
    expect(html).toContain('click');
    expect(html).toContain('href="https://example.org"');
    expect(html).toContain('Hello');
  });
});
