/**
 * Best-effort, in-memory rate limit (per Cloudflare isolate). Stores nothing persistently.
 *
 * Pages Functions have no rate-limiting binding, and each isolate has its own memory, so this only slows down
 * a single client hammering one isolate. The real limit is a Cloudflare WAF rate-limiting rule on
 * /api/contact (docs/DEPLOYMENT.md). IP addresses are hashed with a per-isolate random salt and kept only
 * for the length of the window.
 */
const MAX_CLIENTS = 5000;

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
}

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  /**
   * Created on first use, inside a request: the Cloudflare Workers runtime forbids generating random values
   * in global scope, and this class is instantiated at module load (src/server/contact.ts).
   */
  private salt: Uint8Array | undefined;
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(options: RateLimiterOptions) {
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.now = options.now ?? Date.now;
  }

  private async key(value: string): Promise<string> {
    this.salt ??= crypto.getRandomValues(new Uint8Array(16));
    const data = new Uint8Array([...this.salt, ...new TextEncoder().encode(value)]);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    return Array.from(digest.subarray(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  async allow(client: string): Promise<boolean> {
    const now = this.now();
    const key = await this.key(client);
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    // Re-insert so the Map's insertion order is "least recently seen first".
    this.hits.delete(key);
    this.hits.set(key, recent);
    // Hard memory bound: drop the least recently seen clients (O(1) each, no full scans).
    while (this.hits.size > MAX_CLIENTS) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
    return true;
  }
}
