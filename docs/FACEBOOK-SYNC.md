# Facebook → website news sync

New posts on the institute's Facebook Page become **draft** news items in a pull request.
A person reviews them, edits them if needed, and publishes. Nothing is published automatically unless you
configure an agreed hashtag (off by default).

> **Status: built and tested with fixtures only.** The real Facebook API has never been called and no
> token exists yet. The first real run must be watched by the maintainer (see "First run checklist").

## How it works

```
GitHub Actions (every 45 min, or by hand)
  └─ node scripts/facebook-sync.ts
       1. GET https://graph.facebook.com/v27.0/{FB_PAGE_ID}/published_posts   (Page access token, server side)
       2. skip posts already in the repo (same fbPostId), never touch existing files
       3. download images from Facebook's CDN → resize (max 1600 px) → WebP → metadata stripped
       4. write src/content/news/ar/fb-<postId>.md  (status: draft, source: facebook, needs-review)
  └─ if files changed: commit to the rolling branch facebook-sync/pending + one pull request for review
```

- **One rolling pull request.** New drafts accumulate on `facebook-sync/pending` and its single open PR,
  so a slow review never produces duplicate PRs or duplicate drafts.
- **Rejecting a post for good.** Delete its file in the PR and add its id (`fbPostId`) to
  `src/content/news/facebook-ignored.txt` (one per line, `#` for comments). Without that line, the next run would import it again.

- **Only the Graph API.** No scraping, no browser automation, no Facebook password or session (CLAUDE.md).
- **Token and secrets** exist only in GitHub Actions secrets. They are never written to files, logs or the website.
  Error messages are redacted before printing.
- **Deduplication.** By `fbPostId`, across all language folders. A file that exists is never overwritten,
  even if the Facebook post was edited later.
- **Care flags.** Posts get `careFlags` that **block publishing** until a human removes them (the schema refuses
  `status: published` with flags):
  - `memorial`: condolence or death vocabulary (e.g. «إنا لله وإنا إليه راجعون», «تعزية», «رحمه الله»).
  - `identifiable-people`: every post **with photos**. Someone must confirm that no student or patient is identifiable
    without written consent (docs/CONTENT.md).
  - `personal`: personal greetings or comments (e.g. «عيد ميلاد», «تهنئة» addressed to a person). This is a heuristic.
- **Shown on the site:** text and images only. Never comments, reactions, share counts or embeds.
  The original post is linked (`fbPermalink`), not embedded.
- **Language.** Posts are stored as Arabic (`ar/`). French and English versions are added by hand in the CMS.
  Until then, the French and English sites show the Arabic text with a notice.
- **Image alt text.** It is set to a generic description and the post carries `needs-review: true`.
  Editors must write a real description before publishing.
- **Auto-publish (optional).** Set the repository variable `FB_AUTO_PUBLISH_HASHTAG` (e.g. `#موقع_المعهد`).
  Posts containing it, **and with no care flag**, are written with `status: published`. They still go through the pull request.

## Meta documentation used (read on 2026-11-19, Graph API v27.0)

| Topic | Page |
|---|---|
| Read the Page's own published posts | https://developers.facebook.com/docs/graph-api/reference/page/published_posts/ |
| Page feed: permissions (`pages_read_engagement`, `pages_read_user_content`), tasks, `limit` ≤ 100, about 600 posts/year, expired posts unreadable | https://developers.facebook.com/docs/graph-api/reference/page/feed/ |
| Pages API posts guide (Page access token for people with a role on the Page) | https://developers.facebook.com/docs/pages-api/posts/ |
| Post attachments (`media`, `media_type`, `type`, `subattachments`, `url`) | https://developers.facebook.com/docs/graph-api/reference/story-attachment/ |
| Attachment media (`image`) | https://developers.facebook.com/docs/graph-api/reference/story-attachment-media/ |
| Long-lived User token, then Page token from `/{user-id}/accounts`; Page tokens from a long-lived user token have no fixed expiry | https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/ |
| `appsecret_proof` (HMAC-SHA256 of the token with the app secret), "Require App Secret" | https://developers.facebook.com/docs/graph-api/securing-requests/ |

**Not confirmed by the docs I could read.**
- The `ImageSource` sub-fields (`src`, `width`, `height`): the reference page was unreachable during the run.
  The code reads `media.image.src` and falls back to the post's `full_picture` field (documented on the feed page, max 720 px).
- Whether `published_posts` needs `pages_read_user_content` in addition to `pages_read_engagement`: request both.

## Setup (page admin + maintainer, once)

A **Page admin** must do steps 1 to 4 with their own Facebook account. Never share the Facebook password.

1. **Create a Meta app.** At https://developers.facebook.com/apps → Create app → type **Business**.
   Add the institute's Business portfolio if there is one.
2. **Turn on "Require App Secret".** App settings → Advanced → Security → **Require App Secret**.
   Copy the app secret (Settings → Basic).
3. **Get a Page access token.** Graph API Explorer → select the app → **Get Page Access Token** → select the INFSPM Page.
   Grant `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`.
4. **Make it long-lived.**
   - Exchange the short-lived **user** token for a long-lived one:
     `GET https://graph.facebook.com/v27.0/oauth/access_token?grant_type=fb_exchange_token&client_id={app-id}&client_secret={app-secret}&fb_exchange_token={short-lived-user-token}`.
     Run this from a trusted computer, never in a shared terminal or a chat.
   - Then `GET https://graph.facebook.com/v27.0/me/accounts?access_token={long-lived-user-token}`.
     The INFSPM entry's `access_token` is the **Page token**, and `id` is the **Page id**.
   - Check it in the **Access Token Debugger** (https://developers.facebook.com/tools/debug/accesstoken/).
     It should show "Expires: Never" and the scopes above.
5. **Add GitHub secrets.** GitHub → repository → Settings → Secrets and variables → **Actions**:
   - Secrets: `FB_PAGE_TOKEN`, `FB_APP_SECRET` (enables `appsecret_proof`).
   - Variables: `FB_PAGE_ID`, optionally `FB_AUTO_PUBLISH_HASHTAG`.
6. **Allow pull requests from Actions.** Settings → Actions → General → Workflow permissions →
   "Read and write" + **Allow GitHub Actions to create and approve pull requests**.
   Pull requests opened by the workflow do **not** trigger CI automatically (a GitHub rule for `GITHUB_TOKEN`).
   Close and reopen the PR, or push a commit to it, to run CI.

Until `FB_PAGE_ID` is set, the scheduled job **skips** with a notice and does not fail.

## Token renewal

A Page token obtained from a long-lived user token does not expire on a schedule. It **stops working** when, for example:
- the admin who created it changes their Facebook password;
- the admin loses their role on the Page;
- the admin removes the app's permissions;
- Meta invalidates it for security reasons.

**What happens.** The sync job **fails** with "Facebook token invalid or expired (code 190)". GitHub emails the maintainer
(workflow failure notification). The website keeps working with the existing news.

**Renewing.** Repeat setup steps 3 to 5 and replace the `FB_PAGE_TOKEN` secret. Then run the workflow by hand
(Actions → Facebook sync → Run workflow).

**Rotate immediately** if the token was ever pasted somewhere public:
- Debugger → **Invalidate** (or remove the app from the admin's Facebook settings);
- then renew the token.

## First run checklist

1. Run the workflow by hand and read the log. It prints counts only, never the token.
2. Open the pull request and check one post end to end: text, images, care flags, the link to Facebook.
3. If the image structure differs from the fixtures (see "Not confirmed" above), fix
   `src/server/facebook/transform.ts` and add the real (anonymized) response as a new test fixture.

## Code

| File | Role |
|---|---|
| `src/server/facebook/graph.ts` | API client (published_posts, paging, `appsecret_proof`, error mapping, redaction) |
| `src/server/facebook/transform.ts` | Post → news Markdown (title, body, care flags, status) |
| `src/server/facebook/images.ts` | Image download (Facebook CDN hosts only, size and type limits) and WebP conversion |
| `src/server/facebook/sync.ts` | Orchestration, deduplication, file writing |
| `scripts/facebook-sync.ts` | Command-line entry used by the workflow |
| `.github/workflows/facebook-sync.yml` | Schedule, secrets, pull request |
| `tests/facebook-*.test.ts`, `tests/fixtures/facebook/` | Tests with synthetic fixtures shaped like the documented API |
