# Admin panel (`/admin/`)

The institute's own content editor: sign in with a **username and password** (optional 2-step code),
edit news, activities, programs and pages in Arabic, French and English with a live preview, and publish.

- Interface: `src/admin-app/` (Preact, Arabic first, French switch), page `src/pages/admin/index.astro`.
- Server API: `functions/api/admin/[[path]].ts` → `src/server/admin/` (accounts, sessions, GitHub).
- Tests: `tests/admin.test.ts`.

## How publishing works

Every save is a commit on its own branch (`cms/…`) and a pull request into `main`. The CI checks run, then the
change is merged and Cloudflare publishes the site (about 2 minutes). Nothing invalid can go live: the server
validates with the same rules as the site build, and the build checks again.

| Role | Can do |
|---|---|
| **Administrator** | Everything: publish, approve editors' changes, delete, settings, accounts |
| **Editor** | Write and save. Changes to published content wait for an administrator's approval (dashboard) |

## Security

- Passwords: PBKDF2-SHA-256 (100 000 iterations, random salt). Never stored or logged in clear.
- Sessions: random token in a `__Host-` cookie (Secure, HttpOnly, SameSite=Strict); 8 h maximum, 60 min idle.
- Lockout: 5 wrong passwords → account locked 15 minutes. 10 attempts per minute per IP address.
- 2-step verification (optional per user): authenticator-app codes (TOTP), replayed codes refused.
- Cross-site requests are refused (Origin check + `X-Admin-Request` header).
- The GitHub token stays on the server; the browser only talks to `/api/admin/*`.
- `/admin/*` has a strict Content-Security-Policy: same-origin only, no `unsafe-*` (`public/_headers`).

## Setup (once, by the maintainer)

All values below are set in **Cloudflare → Workers & Pages → infspm-site → Settings → Variables and secrets**
(and **Bindings** for KV), for **Production** and, to try the panel on preview links, **Preview** too.

1. **Accounts store (KV).** Cloudflare → Storage & databases → **Workers KV** → *Create namespace*, name
   `infspm-admin`. Then infspm-site → Settings → **Bindings** → *Add* → KV namespace, variable name
   **`ADMIN_KV`**, namespace `infspm-admin`.
2. **Setup code.** Add a **Secret** `ADMIN_SETUP_CODE`: a long random phrase you invent (at least 12 characters).
   It is asked once, to create the first administrator. You can delete it afterwards.
3. **GitHub key for publishing.** GitHub → Settings → Developer settings → **Fine-grained personal access tokens**
   → *Generate new token*:
   - Repository access: **Only select repositories** → `infspm-site`;
   - Permissions: **Contents: Read and write**, **Pull requests: Read and write** (Metadata: read, automatic);
   - Expiration: up to 1 year (put a reminder in your calendar to renew it).

   Add it in Cloudflare as a **Secret** **`GITHUB_CMS_TOKEN`**. Never paste it anywhere else.
4. **GitHub repository settings** (Settings → General → Pull Requests): tick **Allow auto-merge** and
   **Automatically delete head branches**. Keep the branch protection on `main` (PR + `build` check).
5. Redeploy (or push any change), open `/admin/`, enter the setup code, choose your username and password.

Optional: `GITHUB_REPO` (default `AbdelkarimMouici/infspm-site`).

## Renewing the GitHub key

When it expires, publishing fails with "GitHub" errors. Create a new token with the same permissions (step 3),
replace the `GITHUB_CMS_TOKEN` secret, and redeploy.

## Development

`npm run dev` → `http://localhost:4321/admin/` uses a **practice backend** (`src/admin-app/mock.ts`): the local
content files, changes kept in memory only, sign in with `admin` and any password of 10+ characters.
It is never part of a production build.
