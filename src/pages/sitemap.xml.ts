/**
 * sitemap.xml, generated at build time (no dependency). Lists only indexable pages:
 * no drafts, examples (in production), Arabic-fallback pages, result pages, 404 or /admin/.
 * Each URL lists its translations with xhtml:link hreflang (and x-default = Arabic).
 */
import type { APIRoute } from 'astro';
import { defaultLocale, localeMeta, locales, type Locale } from '~/i18n/config';
import { listedPages, listedTranslations } from '~/lib/sitemap';

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c);
}

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://example.invalid');
  const groups = [...(await listedPages()), ...(await listedTranslations())];

  const urls = groups.flatMap((group) =>
    (Object.entries(group) as [Locale, string][]).map(([, path]) => {
      const alternates = locales
        .filter((code) => group[code])
        .map(
          (code) =>
            `    <xhtml:link rel="alternate" hreflang="${localeMeta[code].hreflang}" href="${escapeXml(new URL(group[code] ?? '', base).href)}"/>`,
        );
      const xDefault = group[defaultLocale]
        ? [`    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(new URL(group[defaultLocale], base).href)}"/>`]
        : [];
      return [`  <url>`, `    <loc>${escapeXml(new URL(path, base).href)}</loc>`, ...alternates, ...xDefault, `  </url>`].join('\n');
    }),
  );

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
