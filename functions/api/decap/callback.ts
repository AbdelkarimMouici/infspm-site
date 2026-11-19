// Cloudflare Pages Function: GET /api/decap/callback (Decap CMS GitHub sign-in, step 2).
import { handleCallback, type OAuthEnv } from '../../../src/server/decap-oauth';

export const onRequestGet = ({ request, env }: { request: Request; env: OAuthEnv }): Promise<Response> =>
  handleCallback(request, env);
