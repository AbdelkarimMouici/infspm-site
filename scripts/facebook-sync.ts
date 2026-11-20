/**
 * Facebook → news drafts (run by .github/workflows/facebook-sync.yml, or by hand).
 *
 *   FB_PAGE_ID=... FB_PAGE_TOKEN=... node scripts/facebook-sync.ts
 *
 * Environment (never commit real values; see docs/FACEBOOK-SYNC.md):
 *   FB_PAGE_ID               numeric Page id (repository variable)
 *   FB_PAGE_TOKEN            long-lived Page access token (secret)
 *   FB_APP_SECRET            optional, enables appsecret_proof (secret)
 *   FB_AUTO_PUBLISH_HASHTAG  optional agreed hashtag (repository variable)
 *   FB_MAX_POSTS             optional, default 25
 *
 * Exit codes: 0 = done or not configured yet, 1 = error (token expired, API error…) so CI fails loudly.
 */
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { redact } from '../src/server/facebook/graph.ts';
import { runSync } from '../src/server/facebook/sync.ts';

const env = process.env;
const pageId = env['FB_PAGE_ID']?.trim() ?? '';
const token = env['FB_PAGE_TOKEN']?.trim() ?? '';
const appSecret = env['FB_APP_SECRET']?.trim() || undefined;
const root = fileURLToPath(new URL('..', import.meta.url));

function output(name: string, value: string | number): void {
  const file = env['GITHUB_OUTPUT'];
  if (file) appendFileSync(file, `${name}=${value}\n`);
}

if (!pageId) {
  console.log('::notice::Facebook sync is not configured yet (FB_PAGE_ID is empty). Nothing to do.');
  output('created', 0);
  process.exit(0);
}
if (!token) {
  console.error('::error::FB_PAGE_TOKEN is missing. See docs/FACEBOOK-SYNC.md (setup).');
  process.exit(1);
}

try {
  const result = await runSync({
    root,
    pageId,
    token,
    appSecret,
    autoPublishHashtag: env['FB_AUTO_PUBLISH_HASHTAG'],
    maxPosts: Number(env['FB_MAX_POSTS'] ?? 25) || 25,
    log: (line) => console.log(redact(line, [token, appSecret])),
  });
  // Counts only: never print post contents, URLs or tokens.
  console.log(
    `Facebook sync: fetched ${result.fetched}, new drafts ${result.created.length}, already known ${result.skippedExisting}, ` +
      `empty ${result.skippedEmpty}, invalid ${result.skippedInvalid}, flagged for review ${result.flagged}, image errors ${result.imageErrors}`,
  );
  for (const file of result.created) console.log(`  + ${file}`);
  output('created', result.created.length);
  output('flagged', result.flagged);
} catch (error) {
  console.error(`::error::${redact((error as Error).message, [token, appSecret])}`);
  process.exit(1);
}
