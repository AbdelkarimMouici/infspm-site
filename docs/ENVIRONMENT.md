# Environment variables and secrets

`.env.example` could not be committed: the project's Claude permission rules deny access to `.env.*` files.
This page is the reference instead. **Never commit real values.** Secrets live only in Cloudflare Pages
(Settings → Environment variables, encrypted) or GitHub Actions secrets.

| Name | Where | Secret? | Used by | Notes |
|---|---|---|---|---|
| `GITHUB_OAUTH_CLIENT_ID` | Cloudflare Pages | no | `functions/api/decap/*` | GitHub OAuth app for Decap CMS sign-in |
| `GITHUB_OAUTH_CLIENT_SECRET` | Cloudflare Pages | **yes** | `functions/api/decap/*` | Never logged or sent to the browser |
| `GITHUB_OAUTH_SCOPE` | Cloudflare Pages | no | `functions/api/decap/*` | `repo` (private repo, default) or `public_repo` |
| `SHOW_EXAMPLE_CONTENT` | build (staging only) | no | `src/lib/content.ts` | `true` shows `example: true` entries. Leave unset in production |

Later steps add their variables below.
