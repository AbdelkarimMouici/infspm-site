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
   GitHub branch protection (required approval + CI) must be enabled, otherwise any editor could publish directly
   (see docs/DEPLOYMENT.md §1).

**File name.** Every new item needs a *File name* in Latin letters, digits and hyphens (for example `open-day-2026`).
Arabic titles cannot be used for file names. It becomes part of the page address and cannot be changed later.

**Images.** Upload photos with the image fields, never inside the text: images in the text are removed.
Strip location (GPS) data before uploading. The test suite rejects images that still contain EXIF metadata.

**Formatting.** Raw HTML, embedded frames and unsafe links are removed from the text automatically.

## Rules (from CLAUDE.md)

- **Facts.** Never invent facts: names, dates, numbers, programs. If something is unknown, leave the field empty.
- **Translations.** A translation that has not been checked by the administration must keep **Translation needs review** ticked.
  The flag is kept in the file for the editors' review list; the public site no longer shows a notice (maintainer's
  decision, 2026-11-20).
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

## Settings and site texts (everything else on the site)

- **Settings** (`src/content/settings/site.json`): logo, official email, phone, address and opening hours
  (in each language), Facebook page link, map link, and **Show demo content**. Leave a value empty until it is
  officially confirmed: the site then shows "to be confirmed". A new logo is uploaded to `src/assets/brand/`
  (square PNG or SVG, transparent background). Invalid values (wrong link, logo elsewhere) fail the build.
- **Site texts** (`src/content/ui/{ar,fr,en}.json`): every interface text (menus, buttons, home-page journey,
  page titles and descriptions), grouped by section, with the Arabic text shown as a hint when editing French
  or English. The editor is generated from the Arabic file (`src/admin/collections.ts`): editors change the
  wording; developers add or remove texts in the JSON files (the tests check all three languages match).

## Demo (example) content

Entries with `example: true` (titles start with "مثال:" / "Exemple :" / "Example:", and a "demo content" badge
is shown) fill the site until the official content is ready: 4 programs, 4 news items and 3 activities, with
abstract illustrations (`src/assets/uploads/examples/`, no photos of people). Their details (durations,
places, dates) are **not facts**.

They are shown when **Settings → Show demo content** is on (currently on, at the maintainer's request), in
development, and in builds with `SHOW_EXAMPLE_CONTENT=true`. **Turn the setting off before the public launch**,
then delete the example files once the real entries are published.

## Setup (maintainer, once)

The GitHub OAuth app and its secrets are **not created yet** (they need your account). See `docs/ENVIRONMENT.md` and `docs/DEPLOYMENT.md`.
