import type { APIRoute } from 'astro';
import { showExamples } from '~/lib/content';

/**
 * robots.txt: everything public is crawlable except the CMS and the API.
 * While demo entries are shown (temporary address / previews), nothing is crawlable, so search engines
 * never read them.
 */
export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL('https://example.invalid');
  const rules = [showExamples ? 'Disallow: /' : 'Allow: /', 'Disallow: /admin/', 'Disallow: /api/'];
  const body = ['User-agent: *', ...rules, '', `Sitemap: ${new URL('/sitemap.xml', base).href}`, ''].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
