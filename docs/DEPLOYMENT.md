# Deployment (Cloudflare Pages) – maintainer guide

> Status: **not deployed.** Every step below needs your accounts, so none of it was done during the autonomous run.
> Step 8 completes this guide. Sections marked *(step 3)* are required before the CMS is used.

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
  include only branches you choose (e.g. `staging`) and exclude `cms/*`.
- Or protect all preview URLs with **Cloudflare Access** (Zero Trust → Access → application for `*.<project>.pages.dev`).

## 4. Cloudflare Pages project *(completed in step 8)*

_To be completed in step 8._
