import type { APIRoute } from 'astro';

/** robots.txt: everything public is crawlable except the CMS and the API. */
export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL('https://example.invalid');
  const body = ['User-agent: *', 'Allow: /', 'Disallow: /admin/', 'Disallow: /api/', '', `Sitemap: ${new URL('/sitemap.xml', base).href}`, ''].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
