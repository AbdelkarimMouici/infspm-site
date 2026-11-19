# Progress log (autonomous run, steps 2–8)

Started: 2026-11-19 (night run). Each step lives on its own branch, created from the previous step's branch,
with one PR per step whose base is the previous step's branch. Nothing is pushed to or merged into `main`.

## Status at a glance

| Step | Branch | PR base | State |
|---|---|---|---|
| 1 | `feat/step-1-scaffold` | `main` | PR #1 open (**not merged yet**, see notes) |
| 2 | `feat/step-2-design-system` | `feat/step-1-scaffold` | in progress |

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
