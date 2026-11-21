# Decisions

Short records of choices that are hard to reverse. Newest at the bottom.

## D1 – Content editor: Decap CMS (2026-11-19, step 3) — replaced by D4

**Context.** CLAUDE.md asks for a git-based CMS (Decap or Keystatic) behind authentication, a static site
with no server or public database, strict security headers, and an approval step before anything is published
(including Facebook drafts).

**Decision.** Decap CMS 3.18, bundled from npm into `/admin/` (no CDN), with the GitHub backend, the
**editorial workflow** and a small same-origin OAuth function (`functions/api/decap/*`).

**Why Decap.**
- **Stays static.** The admin is a static page. Keystatic's GitHub mode needs server API routes
  (`/api/keystatic/*`) running inside the Astro app, which would mean switching the site to server output with an adapter.
- **Approval by design.** In editorial workflow, every edit is a pull request (Draft → In review → Ready).
  Nothing reaches the site until a maintainer merges it. The Facebook sync (step 5) also opens pull requests,
  so editors and the sync use the same review path.
- **Multilingual out of the box.** `i18n.structure: multiple_folders` matches our `src/content/<collection>/<locale>/` layout.
- **Authentication without new accounts.** Editors sign in with GitHub. Only accounts with write access to the
  repository can save anything, and 2FA is enforced on GitHub (CLAUDE.md).

**Costs and mitigations.**
- **Large admin bundle (about 6 MB).** It loads only on `/admin/`, never on public pages.
- **Relaxed CSP on `/admin/`.** The editor needs `'unsafe-eval'` (configuration validation) and inline styles (CSS-in-JS).
  These exceptions are scoped to `/admin/*` in `public/_headers` (step 7). Public pages keep the strict policy.
- **Old transitive dependencies.**
  - `trim` is pinned to 1.0.1 with an npm override, which fixes a ReDoS advisory.
  - Decap 3.18.0 was taken one day after release, an exception to the 7-day rule, because it fixes a minimatch advisory.
  - `npm audit` reports 0 vulnerabilities.
- **One extra function to maintain** for OAuth. It is about 150 lines, covered by tests, and stores nothing.

**Rejected.**
- **Keystatic.** It needs server output, or Keystatic Cloud, which is a third-party service.
- **Decap from a CDN.** CLAUDE.md does not allow third-party scripts.
- **A hosted OAuth proxy service.** It is a third party that would see editors' tokens.

## D2 – English as a third language (2026-11-19)

Added at the maintainer's request during the autonomous run. Routes: `/en/...`. Arabic stays the default.
All English text is marked `needs-review` until the administration validates it.

## D3 – Example content is hidden from production builds (2026-11-19, step 3)

Sample entries have `example: true`. They are visible in `npm run dev` and in builds with
`SHOW_EXAMPLE_CONTENT=true` (for a staging review), and excluded from normal production builds.
This means placeholder text cannot reach the public site by mistake.

## D5 – Light, phone-first redesign with home-page stories (2026-11-22)

**Context.** The maintainer found the dark 3D "journey" (WebGL blood vessel, organs) messy, and most visitors use phones.
Several home-page proposals were reviewed as a standalone file (`design/home-light.html`) before any site change.

**Decision.** One light theme on every page; the WebGL scenes, their styles and the `three` packages are removed.
The home page shows Instagram/Facebook-style stories (latest news, one per program, extra stories with pictures),
then about, news and activities, programs and contact. Everything is editable in the admin panel.

**Why.** Calmer and more official, familiar to the institute's Facebook audience, much lighter on phones (no WebGL,
no 3D download), and no inline code (stories are server-rendered `<template>`s; colours are classes).

## D4 – Own admin panel replaces Decap CMS (2026-11-21)

**Context.** The maintainer asked for a professional admin panel with a good user experience and a normal
username/password sign-in instead of GitHub accounts, "even if the technology changes".

**Decision.** A small admin panel built for the institute: Preact (4 KB, the only new dependency) at `/admin/`, and a
Cloudflare Pages Function `/api/admin/*` that holds the accounts (KV, PBKDF2 hashes, optional TOTP), the sessions and the
GitHub key. Content stays in Git: every save is a pull request merged after the CI checks.

**Why.** Arabic-first interface designed for the staff, live preview in the site's style, roles; stricter security
than Decap (no `unsafe-eval`, no inline styles, the browser never sees a GitHub token); 95 KB instead of 6 MB.

**Trade-offs.** The panel's code is ours to maintain (tests: `tests/admin.test.ts`). The GitHub key expires
(at most one year) and must be renewed (docs/ADMIN.md). Pull-request approvals on `main` must stay at 0, so human
review happens in the panel (roles) rather than on GitHub.

