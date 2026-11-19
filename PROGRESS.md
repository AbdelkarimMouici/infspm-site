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
