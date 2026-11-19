// Cloudflare Pages Function: GET /api/decap/auth (Decap CMS GitHub sign-in, step 1).
import { handleAuth, type OAuthEnv } from '../../../src/server/decap-oauth';

export const onRequestGet = ({ request, env }: { request: Request; env: OAuthEnv }): Response =>
  handleAuth(request, env);
