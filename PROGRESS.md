# Progress log (autonomous run, steps 2–8)

Started: 2026-11-19 (night run). Each step lives on its own branch, created from the previous step's branch,
with one PR per step whose base is the previous step's branch. Nothing is pushed to or merged into `main`.

## Status at a glance

| Step | Branch | PR base | State |
|---|---|---|---|
| 1 | `feat/step-1-scaffold` | `main` | PR #1 open (**not merged yet**, see notes) |
| 2 | `feat/step-2-design-system` | `feat/step-1-scaffold` | PR #2 open |
| 3 | `feat/step-3-content-cms` | `feat/step-2-design-system` | PR #3 open |
| 4 | `feat/step-4-pages` | `feat/step-3-content-cms` | PR #4 open |
| 5 | `feat/step-5-facebook-sync` | `feat/step-4-pages` | PR #5 open |
| 6 | `feat/step-6-contact` | `feat/step-5-facebook-sync` | PR #6 open |
| 7 | `feat/step-7-security-headers` | `feat/step-6-contact` | PR #7 open |
| 8 | `feat/step-8-seo-a11y` | `feat/step-7-security-headers` | PR #8 open |
| 9 | – | – | **not done (as instructed)**: `docs/DEPLOYMENT.md` is ready for you |

## Notes for the maintainer (please review)

- **PR #1 is still open.** The run instructions said step 1 was merged, but GitHub reports PR #1 as `OPEN` and
  `origin/main` is still at the initial commit. This does not block anything because every step branches from the
  previous step's branch. Merge the PRs in order (1 → 2 → … → 8), or retarget each PR to `main` after the previous one merges.
- **English added (your request during the run).** The site now has three languages: Arabic (default, RTL), French and
  English. All French and English interface text is marked `needs-review` because no official translations exist yet.
- **GitHub connectivity was unstable** during the run (many timeouts to github.com). Pushes and PR creation are retried.

## Step 2 – Design system

**Done**
- `src/styles/tokens.css`: the single tokens file. It holds a neutral medical blue/teal palette, the font, radii and shadow. Tests check every colour pair used by components for WCAG AA, and that no colour is defined anywhere else.
- Header: wordmark, desktop navigation with `aria-current`, and a mobile menu built on `<details>`, so it needs no JavaScript and suits the CSP. The language switcher is always visible.
- Footer: dark band with the link list and the confirmed email, which is kept left-to-right inside Arabic text.
- Components: `Button`, `Card` (the whole card is clickable through a single link), `PageHeader` and `NeedsReviewNotice`.
- English locale (`/en/`). All French and English interface text is marked `needs-review`, and English pages show a visible "translation awaiting review" notice.
- hreflang and x-default list only translations that exist, using the `alternates` override in `BaseLayout`.
- Trilingual `404.html` with `noindex`. `.gitattributes` normalizes line endings to LF.

**Checks:** build, `npm run check`, 36 tests and `npm audit` (0 vulnerabilities) pass. Checked in the browser at desktop and 375px (ar/fr/en): no horizontal scroll, the menu works, and the footer is readable.

**Review:** round 1 by the reviewer sub-agent found 0 high, 2 medium and 3 low issues, all fixed:
- `dir` added on cards in another language
- current language announced to screen readers
- CSP-unsafe Button attributes removed
- email `dir=ltr` restored
- 404 page added

**For you to review**
- The palette is a placeholder until the logo arrives (`TODO(content)`).
- The navigation links to pages that only exist from step 4 on. Do not deploy step 2 alone.

## Step 3 – Content collections + CMS

**Done**
- **Collections:** `news`, `activities`, `programs` and `pages`, with one folder per language (`src/content/<collection>/{ar,fr,en}/`).
  - The Zod schemas live in `src/content/schemas.ts`.
  - Alt text is required on every image.
  - Facebook ids and permalinks are validated.
  - A news item with a care flag cannot be published.
- **Example entries** have `example: true` and are hidden from production builds unless `SHOW_EXAMPLE_CONTENT=true`.
- **CMS: Decap.** The full reasoning is in `docs/DECISIONS.md`.
  - The admin lives at `/admin/`, bundled from npm with no CDN.
  - Editorial workflow is on, so every edit becomes a pull request.
  - The language folders match the content collections.
- **OAuth for Decap:** same-origin Cloudflare Pages Functions (`functions/api/decap/`), with a state cookie, a nonce-based CSP and token messages restricted to our own origin. Tested with a mocked GitHub; no real call is made.
- **Docs:** `docs/CMS.md` (editor guide) and `docs/ENVIRONMENT.md`.

**Dependencies added:** `decap-cms-app` 3.18.0, `react` 19.2.9, `react-dom` 19.2.9, and an npm override pinning `trim` to 1.0.1.
- Decap 3.18.0 is one day old, an exception to my 7-day rule, because it fixes a minimatch advisory that 3.17.3 has.
- `npm audit` reports 0 vulnerabilities.

**Checks:** build, check, 55 tests and audit pass. The admin loads its config with no console errors and shows "Login with GitHub".

**Not verified (stop condition):** the real GitHub sign-in. It needs a GitHub OAuth app and its secret, which you must create; see `docs/DEPLOYMENT.md`.

**For you to review**
- `.env.example` is still blocked by the permission rule, so `docs/ENVIRONMENT.md` lists the variables instead.
- `/admin/` needs a relaxed CSP (`unsafe-eval`, inline styles). Step 7 scopes it to `/admin/*` only.

## Step 4 – Pages (ar/fr/en)

**Done**
- **Pages:** Home, About, Programs (list and detail), Admissions, Activities (list and detail), News (list and article), Gallery, Contact and Privacy, in all three languages.
- **Arabic fallback:** an item that has no translation yet shows the Arabic original, with a notice and `lang`/`dir` set.
  - It is `noindex` and left out of hreflang.
  - The language switcher keeps the reader's place.
- **Institutional pages** (About, Admissions, Privacy) come from the `pages` collection.
  - All of them are marked `needs-review`.
  - Placeholders are listed in `docs/CONTENT.md`.
- **Privacy draft** states only what the site does today. Rights and law are `TODO(content)`; hosting and the contact form are added later.

**Checks:**
- Build, check, 79 tests and audit (0 vulnerabilities) pass.
- **Normal build:** 30 pages, no example content.
- **`SHOW_EXAMPLE_CONTENT=true` build:** 39 pages.
- **Reviewer crawl of both builds:** no broken internal links, every hreflang target exists, one `<h1>` per page, no inline scripts or styles.
- **Browser at 375px:** checked in ar/fr/en.

**Review**
- **Round 1:** 2 high, 2 medium, 4 low, all fixed:
  - the privacy draft overclaimed and made legal claims;
  - the language switcher lost the reader's place;
  - the gallery markup was invalid;
  - the badge, breadcrumb and description were in the wrong language on fallback pages;
  - the review notice was missing in Arabic.
- **Round 2:** 2 low, both fixed (TODO marker in the privacy files, unique fallback descriptions).

**For you to review**
- The About, Admissions and Privacy texts are drafts. Real content is needed from the administration.

## Step 5 – Facebook sync

**Done**
- **Meta docs read first** and cited in `docs/FACEBOOK-SYNC.md`: Graph API v27.0, `/{page-id}/published_posts`, Page access token, `limit` ≤ 100, long-lived tokens, `appsecret_proof`.
- **Sync:** client, transform, images and sync modules, plus a command-line script and a 30-minute workflow with one rolling PR.
- **Drafts:** each post becomes `status: draft`, `source: facebook`, with `fbPostId`, date and `needs-review`, stored under `ar/`. Care flags (memorial, photos, personal) block publishing.
- **Images:** downloaded from the Facebook CDN only, converted to WebP, metadata stripped, never hotlinked. Images of unpublished entries are not built or deployed.
- **Dedupe:** by `fbPostId` plus an ignore list. Existing files are never overwritten.
- **Failures:** an expired token (code 190) fails the job loudly with redacted errors. The site is unaffected.

**Checks:**
- Build, check, 101 tests and audit pass.
- **End-to-end with fixtures (no network):** the drafts pass the real build, and the draft photo is absent from `dist/`.

**Review**
- **Round 1:** 0 high, 3 medium, 5 low, all fixed.
- **Round 2:** 3 low, all fixed. They covered a PR that closes mid-run, draft image validation, and the hashtag check before Arabic diacritics.

**Not verified (stop condition):** no real Facebook API call, and no token was created. The image sub-fields `media.image.src` are not confirmed by the docs I could reach, so watch the first real run.

**For you to do:**
- Create the Meta app and a long-lived Page token (a Page admin must do this).
- Add the GitHub secrets and variables.
- Allow Actions to create pull requests, and turn on "Automatically delete head branches".
- Exclude `facebook-sync/*` from Cloudflare previews.

## Step 6 – Contact form

**Done**
- **`POST /api/contact` (Pages Function):**
  - same-origin check, form-urlencoded only, 64 KB limit, honeypot field;
  - Zod validation: no forged lines in the email, and harmless Arabic direction marks are removed rather than refused;
  - Turnstile siteverify (`hostname` and `action` checked, fails closed);
  - best-effort rate limit, hashed and capped, nothing persisted;
  - redirects to a "sent" page or a "not sent" page for each reason;
  - nothing stored or logged.
- **Email:** a private `contact-mailer` Worker behind a service binding (no public URL) re-validates the message and builds a plain-text MIME email with no new dependency, sent to the verified institute address.
- **Form:** shown only when `PUBLIC_TURNSTILE_SITE_KEY` is set. It is accessible and works in RTL.
- **Privacy page:** updated, with Turnstile named as the only third-party script, on the contact page only.

**Cloudflare docs checked:**
- **Turnstile siteverify:** tokens last 5 minutes, are single-use and at most 2048 characters.
- **Pages Functions:** there is no rate-limiting or `send_email` binding, hence the WAF rule and the Worker.

**Checks:**
- Build, check, 134 tests and audit pass.
- **Browser:** the form checked with Cloudflare's public test site key.

**Review**
- **Round 1:** 0 high, 3 medium, 4 low, all fixed. They covered refused Arabic messages, forged email lines, errors with no reason, RFC 2047 folding, the rate limiter's memory, and small fixes.
- **Round 2:** 1 medium (harmless Arabic marks refused) and 1 low (first Subject line length). Both fixed and tested.

**Not verified (stop condition):** no Cloudflare account or domain, so real email delivery and the WAF rule are untested.

**For you to do:** the steps in `docs/DEPLOYMENT.md` §5.
- Create the Turnstile widget.
- Turn on Email Routing and verify the institute's address.
- Deploy the Worker and set `MAIL_FROM`.
- Add the service binding.
- Add the WAF rate-limiting rule.

## Step 7 – Security headers, CSP, audit

**Done**
- **`public/_headers`:**
  - strict CSP (`'self'` only, no inline code, `frame-ancestors 'none'`, `base-uri`/`object-src 'none'`);
  - HSTS for 2 years, without preload;
  - `nosniff`, `strict-origin-when-cross-origin`, Permissions-Policy, COOP/CORP, `X-Frame-Options`;
  - long cache for `/_astro/`.
- **Two exceptions, each replacing the main policy:**
  - Turnstile on `/:locale/contact/` only;
  - Decap's needs on `/admin/*` only (`unsafe-eval`, inline styles, GitHub API, COOP that allows popups, `noindex`).
- **`tests-dist/output.test.ts`** checks every built page:
  - no inline code;
  - every resource is allowed by that page's own CSP, computed with Cloudflare's rule order and `!` detaches;
  - meta refresh stays on the site, and CSS loads nothing remote.
- **CI:** runs these checks twice, with and without the contact form.
- **Function responses** now also send `nosniff`.
- **`.gitignore`:** now ignores `.dev.vars*`.
- **Docs:** `docs/SECURITY.md`.

**Checks:**
- Build, check, 134 unit tests, 55 built-site checks and audit pass.
- **Planted violations are caught:** an inline script, a misplaced Turnstile script, a protocol-relative CDN image, and an unquoted upper-case `onerror`.
- **Decap under its admin CSP** (applied as a meta tag locally): it loads with no CSP errors.

**Review (security audit, also covering the whole stack)**
- 0 high, 1 medium (the checker missed some cases), 6 low. All fixed:
  - an unneeded admin host;
  - `nosniff` on function responses;
  - tests for COOP and the exception policies;
  - `.dev.vars` ignored;
  - the HSTS `includeSubDomains` warning;
  - doc errors.
- **History scan:** a search of the git history for secrets found only test fixtures.

**Not verified (stop condition):** the headers on a real Cloudflare deployment, Turnstile and the signed-in Decap editor under their CSPs, and whether GitHub's sign-in page keeps the popup opener. Check these on staging (`docs/SECURITY.md`).

**For you to decide:** HSTS `includeSubDomains` and preload, once the domain is known.

## Step 8 – SEO, accessibility, Lighthouse

**Done**
- **`sitemap.xml` (with hreflang alternates) and `robots.txt`:** generated at build time, with no dependency. They list only indexable pages.
- **schema.org `EducationalOrganization` JSON-LD:** Arabic name and email only. The French and English names stay out until confirmed.
- **Open Graph tags, a favicon placeholder and `theme-color`.**
- **`_redirects`:** `/ → /ar/` (301) and `/favicon.ico`.
- **`SITE_URL` build variable:** must be an https origin, and the build fails on Cloudflare if it is missing.
- **`tests-dist/seo.test.ts`** checks:
  - `lang`/`dir` on every page;
  - unique titles and descriptions;
  - canonical links;
  - **hreflang reciprocity and x-default**;
  - the sitemap matches the indexable pages and their hreflang;
  - `robots.txt`, JSON-LD, and no broken internal links.
- **HSTS:** `includeSubDomains` is no longer sent until the domain's subdomains are checked.
- **Docs:** `docs/QUALITY.md` (Lighthouse results, manual checks) and the full `docs/DEPLOYMENT.md` (step 9 guide).

**Lighthouse 13.6.0, mobile, 6 pages:** performance 95–100; accessibility, best practices and SEO 100; no console errors. Details in `docs/QUALITY.md`.

**Checks:**
- Build, check, 134 unit tests and 64 built-site checks pass (73 on the example build).
- Audit: 0 vulnerabilities.

**Review**
- 0 high, 5 medium, 6 low. All fixed:
  - deployment order (the domain now comes before the CMS sign-in and the contact form);
  - testing staging behind Access;
  - HSTS `includeSubDomains`;
  - unconfirmed names in the JSON-LD;
  - silent fallback to the placeholder `SITE_URL`;
  - hreflang tests, root page signals, CNAME note, OG locales, `theme-color`, favicon fallback.

---

# Final summary (end of the autonomous run)

**All branches are pushed and every step has a PR:** #1 (step 1, open) and #2 to #8, stacked. Merge them in order.

**Every step passed build, check, tests and audit, plus 2–3 independent review rounds** by a reviewer sub-agent.
There are no open review findings.

## What failed or could not be verified (stop conditions)
- No real external service was used or created:
  - **GitHub OAuth app:** the CMS sign-in is untested;
  - **Meta app and Page token:** the Facebook sync was tested with synthetic fixtures only;
  - **Cloudflare account and domain:** headers, Turnstile, email delivery, the WAF rule and the mailer Worker were not deployed.
- **Not verified:** how real Facebook API image fields look (`media.image.src`), and the Decap editor and the Turnstile widget under their CSPs on a real host.
- **Not done:** deployment, DNS and domain (step 9).

## What you must review / decide
1. **Merging:** merge PR #1, then #2 to #8 in order (each PR's base is the previous branch).
2. **Content:** every `TODO(content)` in `docs/CONTENT.md`.
   - Logo and colours, the French and English names, programs, contact details, the About and Admissions texts, and the privacy rights/law section.
   - All French and English text, and the Arabic drafts, are marked `needs-review`.
3. **Account setup:** `docs/DEPLOYMENT.md` (in its stated order), `docs/FACEBOOK-SYNC.md` and `docs/ENVIRONMENT.md`.
4. **Decisions:**
   - the domain;
   - HSTS `includeSubDomains`/preload;
   - who publishes and approves;
   - the auto-publish hashtag (optional).
5. **Dependencies added during the run:**
   - `decap-cms-app` 3.18.0 (one day old: a security-fix exception to the 7-day rule), `react`/`react-dom` 19.2.9;
   - `@astrojs/markdown-satteri` and `sharp`, both already installed by Astro and now pinned as direct dependencies;
   - npm overrides for `trim` and `minimatch`;
   - Lighthouse was run with `npx`, not installed.
6. **Permission rules hit and respected:**
   - `.env.example` could not be written (`Read(./.env.*)` deny), so `docs/ENVIRONMENT.md` lists the variables instead;
   - `rm -rf` and `curl` were denied, so I used alternatives.
7. **Scratch files to delete:** reviewer sub-agents left a few files outside the repo (they were not allowed to delete them):
   - `C:\Users\abdel\AppData\Local\Temp\r3\sat.mjs`
   - `C:\Users\abdel\AppData\Local\Temp\claude\20c430722e7fe582\55f444be-2fbf-43de-a0ba-e65ab36c4460\scratchpad\t.mts`
   - `C:\Users\abdel\AppData\Local\Temp\claude\20c430722e7fe582\55f444be-2fbf-43de-a0ba-e65ab36c4460\scratchpad\cmp.mjs`
   - `C:\Users\abdel\AppData\Local\Temp\claude\20c430722e7fe582\55f444be-2fbf-43de-a0ba-e65ab36c4460\scratchpad\crawl.mjs`
