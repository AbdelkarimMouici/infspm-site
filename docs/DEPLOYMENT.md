# Deployment (Cloudflare Pages) – maintainer guide

> Status: **not deployed.** Every step below needs your accounts, so none of it was done during the autonomous run
> (step 9 of the build plan is yours). Follow the sections in this order:
>
> 1. Merge the stacked PRs into `main` in order (#1 → #8).
> 2. §1 GitHub protection.
> 3. §4 Cloudflare Pages project, first on **staging**.
> 4. §2 CMS OAuth.
> 5. §5 Contact form.
> 6. `docs/FACEBOOK-SYNC.md`.
> 7. §6 Review with the administration.
> 8. §7 Production domain.
> 9. §8 Go-live checklist.

## 1. GitHub repository protection *(step 3, required)*

Decap's editorial workflow lets any editor press **Publish**, which merges the pull request through the GitHub API.
Branch protection is what enforces a real review:

1. GitHub → repository → Settings → Branches → **Add rule** for `main`.
2. Tick **Require a pull request before merging**, with **Require approvals: 1**.
3. Tick **Require status checks to pass**, and select the `build` job of the CI workflow.
4. Tick **Do not allow bypassing the above settings** (this applies to admins too).
5. Require **2FA** for everyone with write access (Organization or account security settings).

Decap respects branch protection: Publish fails until the PR is approved and CI is green.

## 2. GitHub OAuth app for the CMS *(step 3)*

1. GitHub → Settings → Developer settings → **OAuth Apps → New OAuth App**.
   - **Homepage URL:** `https://<production domain>`
   - **Authorization callback URL:** `https://<production domain>/api/decap/callback`
2. Copy the **Client ID**, then generate a **Client secret**.
3. In Cloudflare Pages → project → Settings → Environment variables (**Production**), add:
   - `GITHUB_OAUTH_CLIENT_ID`
   - `GITHUB_OAUTH_CLIENT_SECRET` (type **Secret**)
   - `GITHUB_OAUTH_SCOPE`: `public_repo` if the repository is public (narrower), otherwise `repo`
4. Notes:
   - The callback URL is built from the request host, so sign-in works only on the domain registered in the OAuth app.
   - Preview `*.pages.dev` URLs cannot sign in. Use a separate OAuth app for staging if needed.
   - Rotate the client secret if it is ever exposed: GitHub → OAuth app → **Generate a new client secret**.
     Then update Cloudflare and delete the old secret.

## 3. Preview deployments *(step 3, required)*

By default Cloudflare Pages builds **every branch** and publishes it on a public `*.pages.dev` URL. That includes the
CMS draft branches (`cms/...`), so unreviewed drafts would be publicly reachable.

- Cloudflare Pages → project → Settings → Builds & deployments → **Preview deployments** → **Custom branches**:
  include only branches you choose (e.g. `staging`) and exclude `cms/*` and `facebook-sync/*`.
- Or protect all preview URLs with **Cloudflare Access** (Zero Trust → Access → application for `*.<project>.pages.dev`).

## 4. Cloudflare Pages project

**Accounts first.** Create the Cloudflare account under the institute's control (shared admin email, **2FA on**). Add at
least two administrators, so access does not depend on one person.

1. **Create the project.** Cloudflare dashboard → Workers & Pages → **Create** → Pages → **Connect to Git**, then pick the GitHub repository.
   - Production branch: `main`.
   - Build command: `npm ci && npm run build`. Output directory: `dist`. Root directory: (empty).
   - The `functions/` folder is detected automatically (Pages Functions).
2. **Environment variables** (Settings → Environment variables). See docs/ENVIRONMENT.md for the full list.
   - `NODE_VERSION` = `24` (matches `.nvmrc`).
   - `SITE_URL`:
     - Production: `https://<final domain>`.
     - Preview/staging: the staging URL (e.g. `https://staging.<project>.pages.dev`).
     - Without it, canonical URLs and the sitemap use the placeholder `example.invalid`.
   - `PUBLIC_TURNSTILE_SITE_KEY` (§5). Leave it empty until the contact form is fully set up; the page then asks people to email.
   - **Staging only:** `SHOW_EXAMPLE_CONTENT=true` if you want to see the example entries. **Never in production.**
   - **Secrets** (type *Secret*): `GITHUB_OAUTH_CLIENT_SECRET`, `TURNSTILE_SECRET_KEY`.
3. **Preview branches:** restrict them as in §3 (exclude `cms/*` and `facebook-sync/*`).
4. **Staging.** Create a `staging` branch from `main`. Cloudflare publishes it at `staging.<project>.pages.dev`. Protect it with
   **Cloudflare Access** (Zero Trust → Access → Applications → Self-hosted, email one-time PIN for the review team).
5. **Check staging:**
   - **Headers:** run https://observatory.mozilla.org on a public page. The CSP, HSTS, nosniff, Referrer-Policy and Permissions-Policy should all be present.
   - **Browser console:** open `/ar/`, `/ar/contact/` and `/admin/`. There must be no "Content Security Policy" errors.
   - **Lighthouse:** run it on mobile, or use https://pagespeed.web.dev/. Compare with docs/QUALITY.md.
   - **Sitemap:** `/sitemap.xml` and `/robots.txt` show the staging origin.

## 5. Contact form *(step 6)*

The form is shown only when `PUBLIC_TURNSTILE_SITE_KEY` is set at build time. Until then, the contact page asks visitors to
write by email. **Not tested against a live account:** these steps need the institute's domain on Cloudflare.

1. **Turnstile widget.** Cloudflare dashboard → Turnstile → **Add widget**.
   - **Hostnames:** the production domain (and staging if needed).
   - **Mode:** Managed.
   - Put the site key in the Pages **build** variable `PUBLIC_TURNSTILE_SITE_KEY`.
   - Put the secret key in the Pages secret `TURNSTILE_SECRET_KEY`.
2. **Email Routing.** On the institute's domain: Email → Email Routing → enable it.
   - Under **Destination addresses**, add and verify the institute's address (`infspmtebessa@inpfp.dz`).
   - Choose a sender such as `contact-form@<domain>`.
3. **Mailer Worker** (`workers/contact-mailer`).
   - Set `MAIL_FROM` in `wrangler.toml` (remove the `TODO`).
   - Deploy it with Wrangler (`npx wrangler deploy` from that folder, logged in to the institute's Cloudflare account).
   - It has **no public URL** (`workers_dev = false`).
4. **Service binding.** Pages project → Settings → Bindings → **Add** → Service binding.
   - Name it `CONTACT_MAILER`, pointing to `infspm-contact-mailer`.
   - Redeploy the project.
5. **Rate limiting (required).** Pages Functions have no rate-limiting binding; the code's limit is only best effort.
   - Add a WAF rule: Security → WAF → **Rate limiting rules**.
   - Use: if URI path equals `/api/contact` and method is `POST`, then **Block** after 5 requests per 10 minutes, per IP.
6. **Test.**
   - Send a message from each language and check that it arrives, with Reply-To set to the sender.
   - Submit with the honeypot filled (developer tools) and check that no email arrives.
   - Submit 6 times quickly and check that the WAF rule blocks it.

## 6. Review with the administration (staging)

- Walk through every page in Arabic, French and English with the person responsible for content.
- Replace every `TODO(content)` listed in docs/CONTENT.md: logo, colours, programs, contact details, About texts, privacy rights and law.
- Get the French and English texts validated, then set `needs-review: false`.
- Delete the example entries (`example: true`).
- Agree who publishes news and who approves the Facebook drafts. Train them on docs/CMS.md.
- Get written approval to publish the site and use the name and logo (docs/CONTENT.md).

## 7. Production domain, DNS, HTTPS

1. **Domain decision.** `.dz` (through the registrar the administration uses) or another TLD.
   Register it in the institute's name, with the account protected by 2FA.
2. **Add the domain to Cloudflare** (Add a site), then change the nameservers at the registrar to Cloudflare's.
   - If the registry does not allow that, use a CNAME setup where available.
3. **Pages → Custom domains:** add the domain (and `www`, redirected to the bare domain or the reverse). Cloudflare issues the certificate.
4. **SSL/TLS settings:**
   - mode **Full (strict)**;
   - **Always Use HTTPS** on;
   - **Minimum TLS 1.2**;
   - **Edge HSTS** on, with the same values as `public/_headers`. It then also covers Pages Function responses.
   - **Before enabling `includeSubDomains`**, confirm every subdomain (mail, intranet…) works over HTTPS.
   - **Do not enable preload yet.**
5. **Update the domain everywhere:**
   - `SITE_URL` (production);
   - the GitHub OAuth app URLs (§2);
   - the Turnstile hostnames (§5);
   - `MAIL_FROM` (§5);
   - docs/CONTENT.md.
6. **DNSSEC:** turn it on in Cloudflare (DNS → Settings), then add the DS record at the registrar.
7. **Email:** if the domain also receives mail, keep the MX records, and add SPF/DMARC records as advised by Email Routing.

## 8. Go-live checklist

- [ ] All PRs merged, CI green on `main`, `npm audit` clean.
- [ ] Branch protection on `main` (§1); 2FA on GitHub, Cloudflare, registrar, institute email and Meta.
- [ ] `SITE_URL` set to the production domain; `SHOW_EXAMPLE_CONTENT` **not** set; example entries deleted.
- [ ] No `TODO(content)` left that is visible to visitors; translations validated.
- [ ] Headers checked (Observatory). No CSP errors in the console. Lighthouse mobile ≥ 90 on staging.
- [ ] CMS: an editor can sign in, create a draft, and see it as a pull request; publishing needs approval.
- [ ] Contact form: a test message arrives in each language; the WAF rule blocks a burst.
- [ ] Facebook sync: first run watched; its pull request reviewed (docs/FACEBOOK-SYNC.md).
- [ ] Sitemap submitted in Google Search Console and Bing Webmaster Tools (domain verification by DNS TXT record).
- [ ] Facebook page "website" field and the institute's email signature point to the new site.
- [ ] Rollback known: Cloudflare Pages → Deployments → **Rollback** to the previous deployment.
