/**
 * Cloudflare Turnstile server-side validation (siteverify).
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult {
  success: boolean;
  hostname?: string;
  action?: string;
  errorCodes: string[];
}

export async function verifyTurnstile(options: {
  secret: string;
  token: string;
  remoteIp: string | null;
  fetchImpl?: typeof fetch;
}): Promise<TurnstileResult> {
  const { secret, token, remoteIp, fetchImpl = fetch } = options;
  if (!token || token.length > 2048) return { success: false, errorCodes: ['invalid-input-response'] };
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);
  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(8_000),
    });
    const data = (await response.json()) as {
      success?: unknown;
      hostname?: unknown;
      action?: unknown;
      'error-codes'?: unknown;
    };
    return {
      success: data.success === true,
      ...(typeof data.hostname === 'string' ? { hostname: data.hostname } : {}),
      ...(typeof data.action === 'string' ? { action: data.action } : {}),
      errorCodes: Array.isArray(data['error-codes']) ? data['error-codes'].map(String) : [],
    };
  } catch {
    // Fail closed: no verification, no message.
    return { success: false, errorCodes: ['internal-error'] };
  }
}
