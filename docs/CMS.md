# Content editing guide (Decap CMS)

The content editor is at `https://<site>/admin/`. Sign in with your GitHub account.
You need **write access to the repository** and **2FA enabled on GitHub**.

## How publishing works

1. **New entry.** Pick a collection (News, Activities, Programs, Pages), write the Arabic version first,
   then the French and English versions in the language tabs.
2. **Save.** This creates a *Draft*, which is a pull request on GitHub. Nothing is public yet.
3. **Set status.** `status: published` is required for the entry to appear on the site. `draft` entries never render.
4. **Review.** Move the entry to *In review*. A maintainer checks the text, the photos (consent!) and the translations.
5. **Publish.** When the maintainer merges the pull request, the site rebuilds automatically.

## Rules (from CLAUDE.md)

- **Facts.** Never invent facts: names, dates, numbers, programs. If something is unknown, leave the field empty.
- **Translations.** A translation that has not been checked by the administration must keep **Translation needs review** ticked.
  French and English pages then show a visible "awaiting review" notice.
- **Alternative text.** Every image needs alternative text that describes it, in each language.
- **Photo consent.** Do not upload identifiable photos of students or patients without written consent (see docs/CONTENT.md).
- **Facebook posts** are imported as drafts (step 5). Posts flagged *Needs a decision* (memorial, identifiable people,
  personal content) cannot be published until the flag is removed after a human decision.

## Folders

```
src/content/
  news/{ar,fr,en}/<slug>.md
  activities/{ar,fr,en}/<slug>.md
  programs/{ar,fr,en}/<slug>.md
  pages/{ar,fr,en}/<slug>.md     # about, admissions, privacy… (no create/delete in the CMS)
src/assets/uploads/              # images uploaded from the CMS (processed at build: resized, WebP)
```

The same file name in each language folder is the same item in another language.
Validation rules are in `src/content/schemas.ts`. An invalid entry fails the build, so it cannot be published broken.

## Example entries

Files with `example: true` are samples for layout only. They show in development and in staging builds with
`SHOW_EXAMPLE_CONTENT=true`, never in a normal production build. Delete them once real content exists.

## Setup (maintainer, once)

The GitHub OAuth app and its secrets are **not created yet** (they need your account). See `docs/ENVIRONMENT.md` and `docs/DEPLOYMENT.md`.
