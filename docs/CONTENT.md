# Content inventory

## Confirmed (from the institute's public Facebook page, checked 2026-11-19)
- Name (AR): المعهد الوطني للتكوين العالي شبه الطبي تبسة
- Short name used on the page: INFSPM
- Page description: "الصفحة الرسمية للمعهد الوطني للتكوين العالي شبه الطبي تبسة" (official page)
- Official email: infspmtebessa@inpfp.dz
- Facebook audience: about 57K followers; reels with 5K–12K views
- Latest post seen: 16 Nov 2026 (a memorial post for a late member of the institute; do not reuse without the administration's approval)

## Not available without logging in (ask the administration / page admin)
- Address, phone, fax, opening hours, map location
- Programs (specialties), duration, admission conditions, diplomas
- History, mission, director's word, organization chart
- Activities, events, partnerships, internships/hospital placements
- News archive (use Facebook "Download your information" from the page admin account)
- Logo in high resolution, official colors, original photos (not compressed Facebook copies)

## Needed from the administration
- [ ] Written approval to publish the site and use the name/logo
- [ ] Official French name and translations
- [ ] Person responsible for content and who publishes news
- [ ] Photo consent policy (students, staff, patients)
- [ ] Domain name decision (.dz or other) and who owns the registrar account

## TODO(content) placeholders in the code (step 1)
- Domain: `SITE_URL` defaults to `https://example.invalid` until the domain is decided (affects canonical/hreflang, sitemap, robots.txt, structured data).
- `src/content/ui/fr.json` (CMS "Site texts"): the French name "Institut National de Formation Supérieure Paramédicale de Tébessa" matches the logo but the wording of all French texts still needs review.
- `src/content/ui/en.json`: the English name "National Institute of Higher Training in Paramedical Sciences, Tébessa" comes from the project brief, not from the administration. All English texts need review.
- Logo: received from the maintainer (2026-11-19), stored in `src/assets/brand/logo.png`, replaceable in CMS Settings. Colours of the design come from it.
- `src/content/settings/site.json` (CMS "Settings"): address, phone, hours, map link and the Facebook page URL are empty until confirmed; only the confirmed email is shown.
- Demo content (`example: true`): 4 programs, 4 news items, 3 activities, unlabeled, shown on preview links and on the temporary `infspm-site.pages.dev` address (for the review with the administration, not crawled by search engines), never on the official domain: they disappear when `SITE_URL` is set to it. Not facts.
- The visible "awaiting official review" notice was removed at the maintainer's request (2026-11-20); `needs-review` flags remain in the files.
- Home page: a generic welcome text and quick links (no institutional facts).

## TODO(content) placeholders (step 4 – pages)
- `src/content/pages/*/about.md`: mission, history, director's word and organization are placeholders ("published after validation").
  The one-line description ("public institution for training in the paramedical field") must be confirmed.
- `src/content/pages/*/admissions.md`: admission requirements, application file and calendar are placeholders.
- `src/content/pages/*/privacy.md`: a **draft that only states what the site does today** (static pages, no analytics, no cookies, no third-party scripts).
  TODO(content): sections on data subject rights and the applicable Algerian law need the administration (and ideally a legal check).
  Hosting and the contact form are added when they exist (steps 6 and 9).
- Contact page: address, phone, opening hours and map link show "to be confirmed" until set in `src/config/site.ts`.
- Programs: the six programs and their Arabic and French names are confirmed by the maintainer (2026-11-21):
  قابلة / Sage-femme, مساعد طبي للصحة العمومية / AMSP, ممرض للصحة العمومية / ISP, مشغّل التصوير الطبي للصحة العمومية / MIMSP,
  مخبري للصحة العمومية / LSP, مساعد تمريض / Aide-soignant. The English names are a translation (`needs-review: true`).
  TODO(content): duration, diploma, admission conditions and a description for each program (the site shows
  "to be confirmed" until they are entered in the admin panel).
- Every page in all three languages is marked `needs-review: true`, including the Arabic drafts, which were not written by the administration.

## TODO(content) placeholders (step 8 – SEO)
- `public/favicon.svg`: neutral placeholder icon (white cross); replace with the official logo.
- `src/components/StructuredData.astro`: address, telephone, logo and Facebook URL (`sameAs`) to add once confirmed.
- Open Graph image (`og:image`) to add once the logo exists.
- `src/layouts/BaseLayout.astro`: `theme-color` uses the placeholder primary colour.
