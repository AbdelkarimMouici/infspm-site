import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Cloudflare Workers / Pages Functions forbid, at module load (global scope): fetch, timers and generating
 * random values. Node allows them, so a regression only shows up when Cloudflare refuses to publish the
 * Functions. These tests import every Function entry point while those APIs throw, like the Workers runtime.
 */
describe('Pages Functions do no forbidden work at module load', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it.each(['../functions/api/contact.ts', '../functions/api/admin/[[path]].ts'])(
    '%s',
    async (path) => {
      vi.resetModules();
      const forbidden = (name: string) => () => {
        throw new Error(`${name} called in global scope`);
      };
      vi.spyOn(crypto, 'getRandomValues').mockImplementation(forbidden('crypto.getRandomValues'));
      vi.spyOn(crypto, 'randomUUID').mockImplementation(forbidden('crypto.randomUUID'));
      vi.spyOn(globalThis, 'fetch').mockImplementation(forbidden('fetch'));
      vi.spyOn(globalThis, 'setTimeout').mockImplementation(forbidden('setTimeout') as unknown as typeof setTimeout);
      vi.spyOn(Math, 'random').mockImplementation(forbidden('Math.random'));

      await expect(import(path)).resolves.toHaveProperty(path.includes('contact') ? 'onRequestPost' : 'onRequest');
    },
  );
});
