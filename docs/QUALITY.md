# Quality checks: accessibility, SEO, performance

## Lighthouse (mobile), 2026-11-19

- **Setup:** Lighthouse 13.6.0, default **mobile** emulation (Moto G-class device, 4× CPU slowdown, slow 4G), headless Chrome.
- **Build:** local production build with `SITE_URL=http://localhost:4321 SHOW_EXAMPLE_CONTENT=true`, served by `astro preview`.
- **Not included:** Cloudflare's headers and network. Re-run on staging.

| Page | Performance | Accessibility | Best practices | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| `/ar/` (home) | 98 | 100 | 100 | 100 | 1.0 s | 0.02 |
| `/fr/news/` | 100 | 100 | 100 | 100 | 0.8 s | 0 |
| `/en/programs/example-program/` | 95 | 100 | 100 | 100 | 0.9 s | 0 |
| `/ar/contact/` | 97 | 100 | 100 | 100 | 1.0 s | 0.024 |
| `/fr/about/` | 99 | 100 | 100 | 100 | 0.8 s | 0.014 |
| `/en/gallery/` | 97 | 100 | 100 | 100 | 0.8 s | 0 |

The goal in CLAUDE.md is ≥ 90 in every category. Public pages load no JavaScript. The contact page loads the
Turnstile script only when the form is enabled, and it was **not** enabled for this run.

**Not yet measured:** real images (none are published yet), the real logo, and Cloudflare's compression and HTTP/3.
Re-run once real content exists.

### How to re-run

```powershell
$env:SITE_URL='http://localhost:4321'; npm run build; npm run preview
```
```powershell
npx --yes lighthouse@13.6.0 http://localhost:4321/ar/ --view --only-categories=performance,accessibility,best-practices,seo
```

Or use PageSpeed Insights (https://pagespeed.web.dev/), which tests from Google's servers. Staging sits behind
Cloudflare Access, so PageSpeed only works while a temporary bypass policy is active (docs/DEPLOYMENT.md §4).
Otherwise, use Chrome DevTools → Lighthouse while signed in.

## Automatic checks (CI)

| Check | Where |
|---|---|
| Colour contrast of every token pair (WCAG AA), RTL-safe CSS (no left/right) | `tests/rtl-and-tokens.test.ts` |
| Accessibility lint of templates (jsx-a11y strict rules) | `npm run check` |
| `lang`/`dir` on every page, unique titles and descriptions, valid canonical/hreflang, sitemap = indexable pages, robots.txt, JSON-LD, no broken internal links | `tests-dist/seo.test.ts` |
| Inline-code and CSP checks | `tests-dist/output.test.ts` |

## Manual checks done (browser, 375 px and desktop)

- **RTL:** Arabic pages are right to left. French and English are left to right. The email address stays left to right inside Arabic text.
- **Keyboard:** skip link first, a visible focus ring everywhere (including the dark footer), the mobile menu works without JavaScript, the language switcher works.
- **Phone width:** no horizontal scrolling on any page at 375 px.
- **One `<h1>` per page**, headings in order, landmarks labelled.
- **Arabic fallback on French/English pages:** `lang="ar" dir="rtl"` on the content, a visible notice, `noindex`.
- **Contact form:** every field has a label, required fields are marked, the honeypot is hidden from people and screen readers,
  each error page explains the problem and how to recover.

## Still to do (needs people or real content)

- **Screen reader pass:** test with NVDA (Windows) and TalkBack (Android) in Arabic and French.
- **Alt text** in both languages for every real photo (the CMS requires it, but the quality needs a human check).
- **Translation review** of all French and English text (`needs-review`).
- **Test with real users** on average phones and connections in Tébessa.
