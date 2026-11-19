# INFSPM Tébessa – Public website

Official public website of the **National Institute of Higher Training in Paramedical Sciences, Tébessa (INFSPM Tébessa)**
(Arabic: المعهد الوطني للتكوين العالي شبه الطبي تبسة). Official email: infspmtebessa@inpfp.dz. Facebook: ~57K followers.

Goal: introduce the institute to the public, show its facilities and programs, activities, and publish news.
This is a REAL production site for a public institution, not a mockup. Security, accuracy and accessibility come first.

## Stack (decided)
- Astro + TypeScript, static output (no server, no public database). Tailwind CSS.
- Content in Markdown/MDX (content collections): news, activities, programs, pages.
- Git-based CMS for staff to publish news (Decap CMS or Keystatic), behind authentication. Decide at step 3 of the plan.
- One serverless function for the contact form only (Cloudflare Pages Functions or Netlify Functions).
- Hosting: Cloudflare Pages (preferred) with Cloudflare in front. CI on GitHub Actions.

## Languages
- Arabic is the default and primary language, fully RTL. French is the second language. English optional later.
- Routes: `/ar/...` and `/fr/...`. Use logical CSS properties (margin-inline, padding-inline) so RTL works everywhere.
- Never machine-translate institutional text silently: mark any translated text `needs-review: true` in frontmatter.
- Arabic fonts self-hosted (e.g. Noto Naskh Arabic / Cairo, IBM Plex Sans Arabic). No Google Fonts CDN at runtime.

## Pages
Home, About (mission, history, director's word, organization), Programs (one page per training program with duration, admission, diploma),
Admissions and registration, Activities, News (list + article pages), Gallery, Contact (form, map link, hours), Legal/Privacy.

## Security rules (non-negotiable)
- No third-party scripts, trackers or embeds by default. Self-host fonts and assets. Facebook feed embed is NOT allowed; link to the page instead.
- Strict security headers via `_headers`: Content-Security-Policy (no inline scripts, nonces/hashes if needed), HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame-ancestors 'none'.
- Contact form: server-side validation (zod), honeypot, Cloudflare Turnstile, rate limiting, size limits, no personal data stored; deliver by email only. Escape all output.
- Secrets only in environment variables / platform secrets. Never commit `.env`. Never print secrets.
- CMS admin protected; 2FA required on GitHub, hosting, domain registrar, and the institute's email.
- Dependencies: pin versions, commit the lockfile, run `npm audit` in CI, enable Dependabot. Add a package only when clearly needed.
- Images: strip EXIF/GPS, resize, convert to WebP/AVIF. Do not publish identifiable photos of students/patients without written consent (see docs/CONTENT.md).

## Quality bar
- Accessibility WCAG 2.2 AA (contrast, keyboard, focus, alt text in both languages, `lang` and `dir` on every page).
- Lighthouse ≥ 90 on mobile for Performance, Accessibility, Best Practices, SEO. Most visitors are on phones with average connections.
- SEO: unique titles/descriptions per language, hreflang, sitemap, robots.txt, schema.org EducationalOrganization.
- Tone: official, clear, respectful. Short sentences. No invented facts.

## Content integrity
- Never invent programs, dates, numbers, names, or statistics. If content is missing, add a clearly marked `TODO(content)` and list it in docs/CONTENT.md.
- Facts must come from the institute (documents, official announcements, the administration). Facebook posts are a source to verify, not to copy verbatim.

## Commands (update as the project grows)
- `npm run dev` – local dev server
- `npm run build` – production build
- `npm run check` – type check + lint
- `npm test` – tests
- `npm audit` – dependency audit

## Working style
- Work in small steps; propose a plan before large changes; commit often with clear messages.
- After each page: check RTL layout, mobile layout, keyboard navigation, and the build.
- Ask me before adding dependencies, changing hosting, or touching security headers.

## Build plan (follow in order)
1. Scaffold Astro + TypeScript + Tailwind, i18n (ar/fr), RTL base layout, design tokens, CI.
2. Design system: colors from the institute logo, typography, header/footer, components.
3. Content collections (news, activities, programs) + CMS choice and setup.
4. Pages: Home, About, Programs, Admissions, Activities, News, Gallery, Contact.
5. Facebook-to-website news sync (see section below).
6. Contact function + Turnstile + rate limit.
7. Security headers, CSP, audit, privacy page.
8. SEO, accessibility audit, Lighthouse, tests.
9. Deploy to staging, review with the administration, then production + domain + DNS + HTTPS.

## Facebook news sync (step 5)
Goal: new posts on the institute's Facebook page appear on the website as news, after admin approval.
- Use the official Meta Graph API only. No scraping, no browser automation, no stored Facebook passwords or sessions.
- Before coding, read the current Meta developer docs and confirm the permissions and token type needed to read a Page's posts. Do not rely on memory.
- A page admin creates the Meta developer app and a long-lived Page access token. The token lives only in CI/hosting secrets (`FB_PAGE_TOKEN`, `FB_PAGE_ID`), never in the repo, logs or client code.
- A scheduled job (GitHub Actions cron, every 30–60 min) fetches recent posts server-side and writes each as a Markdown file in `src/content/news/` with `status: draft`, `source: facebook`, `fbPostId`, date, original language (`ar`).
- Deduplicate by `fbPostId`. Never overwrite a post an admin has edited or approved.
- Download images into the repo, resize, convert to WebP, strip EXIF/GPS. Never hotlink Facebook CDN URLs (they expire and add tracking).
- Approval: drafts are opened as a pull request (or shown in the CMS) for an admin to review. Only `status: published` items appear on the site. Optionally auto-publish posts containing an agreed hashtag, configurable.
- Skip or flag posts that need care: memorials, photos of identifiable students or patients, personal comments. Show text and images only, never Facebook comments or reaction counts.
- French version is added manually; until then the news item shows in Arabic with a note in the French UI.
- Handle token expiry and API errors: the job fails loudly (CI notification to the maintainer) and the site keeps working with existing content.
- Add tests with recorded API fixtures. Document token renewal steps in `docs/FACEBOOK-SYNC.md`.
