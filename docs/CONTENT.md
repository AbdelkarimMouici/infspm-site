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
- `astro.config.mjs`: `site` is `https://example.invalid` until the domain is decided (affects canonical and hreflang URLs).
- `src/i18n/ui/fr.ts`: French institute name "Institut National de Formation Supérieure Paramédicale de Tébessa" is unconfirmed (`needs-review`). All French UI strings need review.
- `src/i18n/ui/en.ts`: English name "National Institute of Higher Training in Paramedical Sciences, Tébessa" comes from the project brief, not from the administration (`needs-review`). All English UI strings need review.
- `src/styles/tokens.css`: colours are a neutral medical blue/teal placeholder palette; replace with the official logo palette.
- `src/components/SiteHeader.astro`: no logo yet (text wordmark only).
- `src/config/site.ts` / `src/components/SiteFooter.astro`: address, phone, hours and the Facebook page URL are missing; only the confirmed email is shown.
- Home pages show only a neutral "under construction" message; no institutional content yet.
