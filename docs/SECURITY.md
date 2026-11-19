# Security overview

How the rules in CLAUDE.md are enforced, and what is checked automatically.

## HTTP security headers (`public/_headers`)

Cloudflare Pages applies `public/_headers` to static files. It does **not** apply it to Pages Functions, which set their own
headers: `/api/decap/*` sends a strict nonce-based CSP, and `/api/contact` only redirects.

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'`, `script-src 'self'`, `style-src 'self'`, no `unsafe-inline`/`unsafe-eval`, `frame-ancestors 'none'`, `base-uri 'none'`, `object-src 'none'`, `form-action 'self'` | Only our own files can run. There is no inline code anywhere in the build |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | HTTPS only, for 2 years. **Not** `preload`: adding the domain to browsers' preload lists is hard to undo, so decide it once the domain is final |
| `X-Content-Type-Options` | `nosniff` | No MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Other sites see only our domain. **Must not be `no-referrer`**: the contact form's same-origin check needs the `Origin` header |
| `Permissions-Policy` | camera, microphone, geolocation, payment, USB, sensors, `browsing-topics` all off | The site needs none of them |
| `Cross-Origin-Opener-Policy` | `same-origin` (`same-origin-allow-popups` on `/admin/*`) | Isolation. The CMS sign-in uses a popup that must keep its opener |
| `Cross-Origin-Resource-Policy` | `same-origin` | Our files cannot be embedded by other sites |
| `X-Frame-Options` | `DENY` | Same as `frame-ancestors 'none'`, for old browsers |

### The two exceptions

- **`/:locale/contact/`**: `script-src` and `frame-src` add `https://challenges.cloudflare.com` for **Cloudflare Turnstile**,
  the anti-bot check CLAUDE.md requires. It is the only third-party resource on the site, and the script appears only
  when the form is enabled.
- **`/admin/*`** (Decap CMS, only for signed-in editors):
  - `'unsafe-eval'` (configuration validation);
  - inline styles (CSS-in-JS);
  - `https://api.github.com`;
  - GitHub avatars;
  - plus `noindex` and `no-store`.

Each exception **replaces** the site policy with `! Content-Security-Policy`, rather than merging with it.

### Automatic checks

`npm run test:dist` (`tests-dist/output.test.ts`) runs in CI after every build, twice: with and without the contact form.
- **Every built page:** no inline `<script>`, `<style>`, `style=` attributes, `on*=` handlers or `javascript:` URLs.
- **External resources:** every external script, stylesheet, image and form target must be allowed by **that page's** CSP,
  computed from `_headers` with Cloudflare's rule order and `!` detaches.
- **Headers file:** the required headers exist, the default policy is strict, and only `/admin/*` uses `unsafe-*`.

**Not verified yet:** the headers on a real Cloudflare deployment, and Decap CMS working under its CSP (`/admin/`).
Check both on staging (docs/DEPLOYMENT.md): open the browser console on `/admin/` and on a contact page, and look for CSP errors.
You can also run `https://observatory.mozilla.org` on the staging URL.

## Other protections (see the code and tests)

| Area | Where |
|---|---|
| Markdown from editors and Facebook: raw HTML, unsafe links and body images removed | `src/lib/remark-safe-markdown.ts` |
| Drafts and example content never published; content queries only through `src/lib/` (ESLint rule) | `src/lib/content.ts`, `eslint.config.js` |
| Images: no EXIF/XMP in committed files; unpublished images never built | `tests/image-metadata.test.ts`, `src/content/schemas.ts` |
| CMS sign-in: OAuth `state` cookie, origin-restricted `postMessage`, nonce CSP | `src/server/decap-oauth.ts` |
| Facebook sync: token only in CI secrets, redacted errors, CDN allow-list, never overwrite | `src/server/facebook/*`, `docs/FACEBOOK-SYNC.md` |
| Contact form: origin check, size limit, honeypot, Zod, Turnstile, rate limit, no storage | `src/server/contact.ts`, `docs/DEPLOYMENT.md` §5 |
| Dependencies: exact versions, lockfile, `npm audit` in CI (moderate+), Dependabot with a 7-day cooldown | `package.json`, `.github/` |

## Accounts (CLAUDE.md: 2FA everywhere)

Enable 2FA on GitHub, Cloudflare, the domain registrar, the institute's email and the Meta account of the Facebook Page admin.
Protect `main` with required reviews (docs/DEPLOYMENT.md §1).
