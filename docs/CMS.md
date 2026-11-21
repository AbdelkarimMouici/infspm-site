# Content editing guide (admin panel)

The content editor is at `https://<site>/admin/`. Sign in with the **username and password** an administrator gave
you (and your 2-step code if you turned it on in **My account**). Setup, security and roles: `docs/ADMIN.md`.

## How publishing works

1. **New entry.** Pick a section (News, Activities, Programs) and write the Arabic version first, then the French and
   English versions in the language tabs. The preview beside the form shows the page as it will look on the site.
2. **Status.** *Draft* entries never appear on the site; *Published* entries do.
3. **Save / Publish.** Every save becomes a pull request on GitHub. The site build checks it, then it is merged
   automatically and the site updates in about two minutes. The dashboard and the lists show "being published" meanwhile.
4. **Editors.** Changes by an editor to published content wait on the dashboard until an administrator approves them.

## Home-page stories

The circles at the top of the home page open full-screen "stories", like on Facebook or Instagram.

- **New**: filled automatically with the three latest news items and activities (with their first photo).
  Switch it off in **Settings**.
- **One per program**: automatic, from the program's name, abbreviation and duration. Edit those in **Programs**
  (short name, abbreviation, colour and icon are there too).
- **Pictures for a program**: create a story in **Stories** and choose the program under *Linked program*. Its text
  and pictures are added after the program's own slide, and the first picture fills the circle.
- **Extra stories** (an event, an announcement): create a story without a linked program. Order, colour and icon
  decide where and how the circle appears. A button link is optional: a site path (`/ar/news/`) or an `https://` link.

## Rules (from CLAUDE.md)

- **Facts.** Never invent facts: names, dates, numbers, programs. If something is unknown, leave the field empty.
- **Translations.** A French or English translation not yet checked by the administration must keep **Translation needs review** ticked.
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
- **Site texts** (`src/content/ui/{ar,fr,en}.json`): every interface text (menus, buttons, home page,
  page titles and descriptions), grouped by section, with the Arabic text shown as a hint when editing French
  or English. The editor is generated from the Arabic file (`src/admin/collections.ts`): editors change the
  wording; developers add or remove texts in the JSON files (the tests check all three languages match).

## Demo (example) content

Entries with `example: true` (files named `*example*`) fill the design for review: 4 programs, 4 news items and
3 activities, with abstract illustrations (`src/assets/uploads/examples/`, no photos of people). They carry no
visible label (maintainer's choice, 2026-11-20), and their details (durations, dates, places) are **not facts**,
so they are **never shown on the live site** (production branch `main`). They appear only:

- on Cloudflare preview links (other branches) while **Settings → Show demo content on preview links** is on;
- in development, and in builds with `SHOW_EXAMPLE_CONTENT=true`.

On the live site, sections without real entries show their "nothing published yet" message. Delete the example
files once the real entries are published.

## Setup (maintainer, once)

See `docs/ADMIN.md` (accounts store, GitHub key, first administrator).
