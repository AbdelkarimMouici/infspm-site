// Cloudflare Pages Function: /api/admin/* (admin panel API). Logic and tests: src/server/admin/router.ts.
import { handleAdmin, type AdminEnv } from '../../../src/server/admin/router';

export const onRequest = ({ request, env }: { request: Request; env: AdminEnv }): Promise<Response> =>
  handleAdmin(request, env);
