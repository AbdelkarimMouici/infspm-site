# Environment variables and secrets

`.env.example` could not be committed: the project's Claude permission rules deny access to `.env.*` files.
This page is the reference instead. **Never commit real values.** Secrets live only in Cloudflare Pages
(Settings → Environment variables, encrypted) or GitHub Actions secrets.

| Name | Where | Secret? | Used by | Notes |
|---|---|---|---|---|
| `GITHUB_OAUTH_CLIENT_ID` | Cloudflare Pages | no | `functions/api/decap/*` | GitHub OAuth app for Decap CMS sign-in |
| `GITHUB_OAUTH_CLIENT_SECRET` | Cloudflare Pages | **yes** | `functions/api/decap/*` | Never logged or sent to the browser |
| `GITHUB_OAUTH_SCOPE` | Cloudflare Pages | no | `functions/api/decap/*` | `public_repo` if the repository is public (narrower, recommended). `repo` (default) is needed for a private repository but grants access to all of the editor's private repos |
| `SHOW_EXAMPLE_CONTENT` | build (staging only) | no | `src/lib/content.ts` | `true` shows `example: true` entries. Leave unset in production |

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
