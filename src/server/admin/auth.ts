/**
 * Admin accounts and sessions, stored in a Cloudflare KV namespace (binding ADMIN_KV).
 *
 * Keys:
 *   user:<username>            → User (JSON). Passwords only as PBKDF2 hashes.
 *   session:<sha256(token)>    → Session (JSON), expires after SESSION_TTL; idle sessions end after IDLE_MS.
 *   rl:<sha256(ip)>:<minute>   → login attempts per IP and minute (expires after 2 minutes).
 *
 * Roles: "admin" publishes, edits settings and manages accounts; "editor" writes and saves drafts.
 */
import {
  DUMMY_HASH,
  hashPassword,
  newTotpSecret,
  otpauthUri,
  randomToken,
  safeEqual,
  sha256Hex,
  verifyPassword,
  verifyTotp,
} from './crypto';

export interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string }): Promise<{ keys: { name: string }[] }>;
}

export type Role = 'admin' | 'editor';

export interface User {
  username: string;
  displayName: string;
  role: Role;
  passwordHash: string;
  totpEnabled: boolean;
  totpSecret?: string;
  pendingTotpSecret?: string;
  lastTotpStep?: number;
  failed: number;
  lockedUntil?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicUser {
  username: string;
  displayName: string;
  role: Role;
  totpEnabled: boolean;
  createdAt: string;
}

interface Session {
  username: string;
  created: number;
  lastSeen: number;
}

export const SESSION_COOKIE = '__Host-infspm_admin';
export const SESSION_TTL = 8 * 60 * 60; // seconds
export const IDLE_MS = 60 * 60 * 1000;
export const MAX_FAILED = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const IP_LIMIT_PER_MINUTE = 10;
export const MIN_PASSWORD = 10;

export class AuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message = code,
  ) {
    super(message);
  }
}

const USERNAME = /^[a-z0-9._-]{3,32}$/;

export function publicUser(user: User): PublicUser {
  return {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    totpEnabled: user.totpEnabled,
    createdAt: user.createdAt,
  };
}

export function normalizeUsername(value: unknown): string {
  const username = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!USERNAME.test(username)) throw new AuthError(400, 'invalid_username');
  return username;
}

export function checkPassword(value: unknown): string {
  const password = String(value ?? '');
  if (password.length < MIN_PASSWORD || password.length > 200) throw new AuthError(400, 'weak_password');
  return password;
}

function cleanName(value: unknown, fallback: string): string {
  const name = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 60);
  return name || fallback;
}

export class Auth {
  constructor(
    private readonly kv: KV,
    private readonly now: () => number = Date.now,
  ) {}

  // ---------- Users ----------
  async getUser(username: string): Promise<User | null> {
    const raw = await this.kv.get(`user:${username}`);
    return raw ? (JSON.parse(raw) as User) : null;
  }

  private async saveUser(user: User): Promise<void> {
    user.updatedAt = new Date(this.now()).toISOString();
    await this.kv.put(`user:${user.username}`, JSON.stringify(user));
  }

  async listUsers(): Promise<PublicUser[]> {
    const { keys } = await this.kv.list({ prefix: 'user:' });
    const users = await Promise.all(keys.map((k) => this.getUser(k.name.slice(5))));
    return users.filter((u): u is User => u !== null).map(publicUser);
  }

  async hasUsers(): Promise<boolean> {
    const { keys } = await this.kv.list({ prefix: 'user:' });
    return keys.length > 0;
  }

  async createUser(input: { username: unknown; displayName: unknown; role: unknown; password: unknown }): Promise<PublicUser> {
    const username = normalizeUsername(input.username);
    const password = checkPassword(input.password);
    const role: Role = input.role === 'admin' ? 'admin' : 'editor';
    if (await this.getUser(username)) throw new AuthError(409, 'username_taken');
    const stamp = new Date(this.now()).toISOString();
    const user: User = {
      username,
      displayName: cleanName(input.displayName, username),
      role,
      passwordHash: await hashPassword(password),
      totpEnabled: false,
      failed: 0,
      createdAt: stamp,
      updatedAt: stamp,
    };
    await this.saveUser(user);
    return publicUser(user);
  }

  /** First administrator. Allowed only while no account exists, with the setup code from the environment. */
  async setup(
    setupCode: string | undefined,
    input: { code: unknown; username: unknown; displayName: unknown; password: unknown },
  ): Promise<PublicUser> {
    if (!setupCode || setupCode.length < 12) throw new AuthError(503, 'setup_not_configured');
    if (await this.hasUsers()) throw new AuthError(409, 'already_set_up');
    if (!safeEqual(String(input.code ?? ''), setupCode)) throw new AuthError(403, 'bad_setup_code');
    return this.createUser({ ...input, role: 'admin' });
  }

  async updateUser(actor: User, username: string, changes: { displayName?: unknown; role?: unknown }): Promise<PublicUser> {
    const user = await this.getUser(username);
    if (!user) throw new AuthError(404, 'not_found');
    if (changes.displayName !== undefined) user.displayName = cleanName(changes.displayName, user.username);
    if (changes.role !== undefined) {
      const role: Role = changes.role === 'admin' ? 'admin' : 'editor';
      if (user.role === 'admin' && role !== 'admin') await this.assertAnotherAdmin(user.username);
      if (user.username === actor.username && role !== 'admin') throw new AuthError(400, 'cannot_demote_self');
      user.role = role;
    }
    await this.saveUser(user);
    return publicUser(user);
  }

  async resetPassword(username: string, password: unknown): Promise<void> {
    const user = await this.getUser(username);
    if (!user) throw new AuthError(404, 'not_found');
    user.passwordHash = await hashPassword(checkPassword(password));
    user.failed = 0;
    delete user.lockedUntil;
    await this.saveUser(user);
    await this.endSessionsOf(username);
  }

  async changeOwnPassword(user: User, current: unknown, next: unknown): Promise<void> {
    if (!(await verifyPassword(String(current ?? ''), user.passwordHash))) throw new AuthError(403, 'bad_password');
    user.passwordHash = await hashPassword(checkPassword(next));
    await this.saveUser(user);
  }

  async deleteUser(actor: User, username: string): Promise<void> {
    if (username === actor.username) throw new AuthError(400, 'cannot_delete_self');
    const user = await this.getUser(username);
    if (!user) throw new AuthError(404, 'not_found');
    if (user.role === 'admin') await this.assertAnotherAdmin(username);
    await this.kv.delete(`user:${username}`);
    await this.endSessionsOf(username);
  }

  private async assertAnotherAdmin(except: string): Promise<void> {
    const admins = (await this.listUsers()).filter((u) => u.role === 'admin' && u.username !== except);
    if (admins.length === 0) throw new AuthError(400, 'last_admin');
  }

  // ---------- 2-step verification ----------
  async startTotp(user: User): Promise<{ secret: string; uri: string }> {
    user.pendingTotpSecret = newTotpSecret();
    await this.saveUser(user);
    return { secret: user.pendingTotpSecret, uri: otpauthUri(user.pendingTotpSecret, user.username) };
  }

  async confirmTotp(user: User, code: unknown): Promise<void> {
    if (!user.pendingTotpSecret) throw new AuthError(400, 'no_pending_totp');
    const step = await verifyTotp(user.pendingTotpSecret, String(code ?? ''), this.now());
    if (step === null) throw new AuthError(403, 'bad_code');
    user.totpSecret = user.pendingTotpSecret;
    user.totpEnabled = true;
    user.lastTotpStep = step;
    delete user.pendingTotpSecret;
    await this.saveUser(user);
  }

  async disableTotp(user: User, password: unknown): Promise<void> {
    if (!(await verifyPassword(String(password ?? ''), user.passwordHash))) throw new AuthError(403, 'bad_password');
    user.totpEnabled = false;
    delete user.totpSecret;
    delete user.pendingTotpSecret;
    delete user.lastTotpStep;
    await this.saveUser(user);
  }

  // ---------- Login ----------
  private async allowIp(ip: string): Promise<boolean> {
    const key = `rl:${(await sha256Hex(ip)).slice(0, 24)}:${Math.floor(this.now() / 60_000)}`;
    const count = Number((await this.kv.get(key)) ?? '0') + 1;
    await this.kv.put(key, String(count), { expirationTtl: 120 });
    return count <= IP_LIMIT_PER_MINUTE;
  }

  /** Returns a session token. Throws AuthError (generic messages: no hint whether the username exists). */
  async login(input: { username: unknown; password: unknown; code?: unknown }, ip: string): Promise<{ token: string; user: PublicUser }> {
    if (!(await this.allowIp(ip))) throw new AuthError(429, 'too_many_attempts');
    let username: string;
    try {
      username = normalizeUsername(input.username);
    } catch {
      await verifyPassword('x', DUMMY_HASH);
      throw new AuthError(401, 'bad_credentials');
    }
    const user = await this.getUser(username);
    const password = String(input.password ?? '');
    if (!user) {
      await verifyPassword(password, DUMMY_HASH);
      throw new AuthError(401, 'bad_credentials');
    }
    const now = this.now();
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new AuthError(423, 'locked', String(Math.ceil((user.lockedUntil - now) / 60_000)));
    }
    const fail = async (code: string): Promise<never> => {
      user.failed += 1;
      if (user.failed >= MAX_FAILED) {
        user.lockedUntil = now + LOCK_MS;
        user.failed = 0;
      }
      await this.saveUser(user);
      throw new AuthError(401, code);
    };
    if (!(await verifyPassword(password, user.passwordHash))) return fail('bad_credentials');
    if (user.totpEnabled && user.totpSecret) {
      const code = String(input.code ?? '').trim();
      if (!code) throw new AuthError(401, 'code_required');
      const step = await verifyTotp(user.totpSecret, code, now);
      if (step === null || (user.lastTotpStep !== undefined && step <= user.lastTotpStep)) return fail('bad_code');
      user.lastTotpStep = step;
    }
    user.failed = 0;
    delete user.lockedUntil;
    await this.saveUser(user);
    const token = randomToken();
    const session: Session = { username: user.username, created: now, lastSeen: now };
    await this.kv.put(`session:${await sha256Hex(token)}`, JSON.stringify(session), { expirationTtl: SESSION_TTL });
    return { token, user: publicUser(user) };
  }

  /** The signed-in user for a session token, or null. Ends idle sessions. */
  async userFromToken(token: string | undefined): Promise<User | null> {
    if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
    const key = `session:${await sha256Hex(token)}`;
    const raw = await this.kv.get(key);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    const now = this.now();
    if (now - session.lastSeen > IDLE_MS || now - session.created > SESSION_TTL * 1000) {
      await this.kv.delete(key);
      return null;
    }
    const user = await this.getUser(session.username);
    if (!user) {
      await this.kv.delete(key);
      return null;
    }
    // Refresh the idle timer at most every 5 minutes (KV writes are limited).
    if (now - session.lastSeen > 5 * 60 * 1000) {
      session.lastSeen = now;
      const remaining = Math.max(60, Math.floor(SESSION_TTL - (now - session.created) / 1000));
      await this.kv.put(key, JSON.stringify(session), { expirationTtl: remaining });
    }
    return user;
  }

  async logout(token: string | undefined): Promise<void> {
    if (token && /^[0-9a-f]{64}$/.test(token)) await this.kv.delete(`session:${await sha256Hex(token)}`);
  }

  private async endSessionsOf(username: string): Promise<void> {
    const { keys } = await this.kv.list({ prefix: 'session:' });
    for (const { name } of keys) {
      const raw = await this.kv.get(name);
      if (raw && (JSON.parse(raw) as Session).username === username) await this.kv.delete(name);
    }
  }
}
