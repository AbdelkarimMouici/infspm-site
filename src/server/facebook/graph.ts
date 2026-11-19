/**
 * Minimal Graph API client for reading the Page's own published posts (server side only).
 * Docs: https://developers.facebook.com/docs/graph-api/reference/page/published_posts/ (v27.0)
 *
 * The access token is never logged or included in error messages (see `redact`).
 */
import { createHmac } from 'node:crypto';

export const GRAPH_VERSION = 'v27.0';
const GRAPH_ORIGIN = 'https://graph.facebook.com';

export const POST_FIELDS = [
  'id',
  'message',
  'created_time',
  'permalink_url',
  'full_picture',
  'attachments{media_type,type,url,media,subattachments{media_type,type,media}}',
].join(',');

export interface GraphImage {
  src?: string;
  width?: number;
  height?: number;
}
export interface GraphAttachment {
  media_type?: string;
  type?: string;
  url?: string;
  media?: { image?: GraphImage; source?: string };
  subattachments?: { data?: GraphAttachment[] };
}
export interface GraphPost {
  id: string;
  message?: string;
  created_time: string;
  permalink_url?: string;
  full_picture?: string;
  attachments?: { data?: GraphAttachment[] };
}
interface GraphPage<T> {
  data?: T[];
  paging?: { next?: string };
  error?: GraphErrorBody;
}
interface GraphErrorBody {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
}

export class GraphError extends Error {
  readonly code: number | undefined;
  readonly tokenProblem: boolean;
  // No TypeScript parameter properties: the script runs with Node's built-in type stripping.
  constructor(message: string, code: number | undefined, tokenProblem: boolean) {
    super(message);
    this.name = 'GraphError';
    this.code = code;
    this.tokenProblem = tokenProblem;
  }
}

export interface GraphConfig {
  pageId: string;
  token: string;
  appSecret?: string | undefined;
  /** Maximum number of posts to read (newest first). */
  maxPosts?: number;
  fetchImpl?: typeof fetch;
}

/** Removes secrets from any text before it is printed. */
export function redact(text: string, secrets: (string | undefined)[]): string {
  let out = text;
  for (const secret of secrets) if (secret && secret.length >= 4) out = out.split(secret).join('[redacted]');
  return out.replace(/(access_token|appsecret_proof)=[^&\s"]+/g, '$1=[redacted]');
}

export function appSecretProof(token: string, appSecret: string): string {
  return createHmac('sha256', appSecret).update(token).digest('hex');
}

function describeError(error: GraphErrorBody | undefined, status: number): GraphError {
  const code = error?.code;
  // 190: invalid/expired token. 102: session issue. 10/200-299: permissions.
  const tokenProblem = code === 190 || code === 102;
  const permissionProblem = code === 10 || (code !== undefined && code >= 200 && code < 300);
  const reason = tokenProblem
    ? 'Facebook token invalid or expired (code 190). Renew it: docs/FACEBOOK-SYNC.md#token-renewal'
    : permissionProblem
      ? `Facebook permission missing (code ${code}). Check the token scopes: docs/FACEBOOK-SYNC.md#setup-page-admin--maintainer-once`
      : `Facebook API error (HTTP ${status}${code !== undefined ? `, code ${code}` : ''})`;
  return new GraphError(reason, code, tokenProblem);
}

/** Reads up to `maxPosts` of the Page's published posts, newest first, following pagination. */
export async function fetchPublishedPosts(config: GraphConfig): Promise<GraphPost[]> {
  const { pageId, token, appSecret, maxPosts = 25, fetchImpl = fetch } = config;
  if (!/^\d+$/.test(pageId)) throw new GraphError('FB_PAGE_ID must contain digits only', undefined, false);

  const first = new URL(`${GRAPH_ORIGIN}/${GRAPH_VERSION}/${pageId}/published_posts`);
  first.searchParams.set('fields', POST_FIELDS);
  first.searchParams.set('limit', String(Math.min(maxPosts, 100)));

  const posts: GraphPost[] = [];
  let next: string | undefined = first.href;
  let pages = 0;
  while (next && posts.length < maxPosts && pages < 10) {
    const url = new URL(next);
    if (url.origin !== GRAPH_ORIGIN) throw new GraphError('Unexpected pagination host', undefined, false);
    // Documented form: access_token query parameter. URLs are never printed; errors are redacted.
    url.searchParams.set('access_token', token);
    if (appSecret) url.searchParams.set('appsecret_proof', appSecretProof(token, appSecret));

    let response: Response;
    try {
      response = await fetchImpl(url.href, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new GraphError(redact(`Network error calling Facebook: ${String(error)}`, [token, appSecret]), undefined, false);
    }
    let body: GraphPage<GraphPost>;
    try {
      body = (await response.json()) as GraphPage<GraphPost>;
    } catch {
      throw new GraphError(`Facebook returned a non-JSON response (HTTP ${response.status})`, undefined, false);
    }
    if (!response.ok || body.error) throw describeError(body.error, response.status);

    posts.push(...(body.data ?? []));
    next = body.paging?.next;
    pages++;
  }
  return posts.slice(0, maxPosts);
}
