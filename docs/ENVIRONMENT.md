# Environment variables and secrets

`.env.example` could not be committed: the project's Claude permission rules deny access to `.env.*` files.
This page is the reference instead. **Never commit real values.** Secrets live only in Cloudflare Pages
(Settings → Environment variables, encrypted) or GitHub Actions secrets.

| Name | Where | Secret? | Used by | Notes |
|---|---|---|---|---|
| `ADMIN_KV` | Cloudflare Pages (binding, Production + Preview) | — | `src/server/admin/*` | KV namespace `infspm-admin`: admin accounts, sessions, login attempt counters |
| `GITHUB_CMS_TOKEN` | Cloudflare Pages (Production + Preview) | **yes** | `src/server/admin/github.ts` | Fine-grained token, this repository only, Contents + Pull requests read/write. Never sent to the browser. Renewal: docs/ADMIN.md |
| `ADMIN_SETUP_CODE` | Cloudflare Pages | **yes** | `src/server/admin/auth.ts` | Only needed to create the first administrator (12+ characters). Delete it afterwards |
| `GITHUB_REPO` | Cloudflare Pages | no | `src/server/admin/router.ts` | Optional, default `AbdelkarimMouici/infspm-site` |
| `SITE_URL` | build (Pages, per environment) | no | `astro.config.mjs` | Public origin, e.g. `https://example.dz` (no trailing slash). Used by canonical/hreflang, sitemap, robots.txt, JSON-LD. Default: `https://example.invalid` |
| `SHOW_EXAMPLE_CONTENT` | build (staging only) | no | `src/lib/content.ts` | `true` shows `example: true` entries. Leave unset in production. Cloudflare preview builds (`CF_PAGES_BRANCH` ≠ `main`) also show them while the CMS setting is on |

### Facebook sync (step 5) – GitHub Actions, see docs/FACEBOOK-SYNC.md

| Name | Kind | Secret? | Notes |
|---|---|---|---|
| `FB_PAGE_ID` | Actions **variable** | no | Numeric Page id. Empty = sync disabled (runs exit with a notice) |
| `FB_PAGE_TOKEN` | Actions **secret** | **yes** | Long-lived Page access token. Never in the repo, logs or client code |
| `FB_APP_SECRET` | Actions **secret** | **yes** | Optional; enables `appsecret_proof` (turn on "Require App Secret" in the Meta app) |
| `FB_AUTO_PUBLISH_HASHTAG` | Actions variable | no | Optional agreed hashtag for auto-publishing posts without care flags |
| `FB_MAX_POSTS` | env | no | Optional, default 25 |

Later steps add their variables below.

### Contact form (step 6) – Cloudflare, see docs/DEPLOYMENT.md §5

| Name | Where | Secret? | Notes |
|---|---|---|---|
| `PUBLIC_TURNSTILE_SITE_KEY` | Pages **build** variable | no (public) | Turnstile widget site key. Empty = the form is not rendered (visitors are asked to email) |
| `TURNSTILE_SECRET_KEY` | Pages Function | **yes** | Turnstile secret for siteverify. Missing = every submission is refused (fail closed) |
| `CONTACT_MAILER` | Pages **service binding** | – | Binding to the `infspm-contact-mailer` Worker |
| `MAIL_FROM`, `MAIL_TO` | mailer Worker vars (`workers/contact-mailer/wrangler.toml`) | no | Sender on the institute's domain; verified destination (the institute's address) |
| `EMAIL` | mailer Worker `send_email` binding | – | Restricted to the verified destination address |

For local testing only, Cloudflare publishes test keys (for example site key `1x00000000000000000000AA`). Never use them in production.
