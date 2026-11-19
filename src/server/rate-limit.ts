/**
 * Best-effort, in-memory rate limit (per Cloudflare isolate). Stores nothing persistently.
 *
 * Pages Functions have no rate-limiting binding, and each isolate has its own memory, so this only slows down
 * a single client hammering one isolate. The real limit is a Cloudflare WAF rate-limiting rule on
 * /api/contact (docs/DEPLOYMENT.md). IP addresses are hashed with a per-isolate random salt and kept only
 * for the length of the window.
 */
export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
}

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly salt = crypto.getRandomValues(new Uint8Array(16));
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(options: RateLimiterOptions) {
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.now = options.now ?? Date.now;
  }

  private async key(value: string): Promise<string> {
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
    this.hits.set(key, recent);
    // Keep memory bounded.
    if (this.hits.size > 5000) {
      for (const [k, times] of this.hits) if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(k);
    }
    return true;
  }
}
