import 'server-only';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Cache lives outside the source tree so Next.js doesn't watch it
const CACHE_ROOT = path.resolve(process.cwd(), '.cache', 'mailcow');

function hash(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 16);
}

function keyToPath(key: string): string {
  // Keep alphanumeric + dashes readable; hash the rest for filesystem safety
  const safe = key.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 64);
  const h = hash(key);
  return path.join(CACHE_ROOT, `${safe}-${h}.json`);
}

let ensuredDir = false;
async function ensureDir(): Promise<void> {
  if (ensuredDir) return;
  await mkdir(CACHE_ROOT, { recursive: true });
  ensuredDir = true;
}

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await readFile(keyToPath(key), 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, value: T): Promise<void> {
  try {
    await ensureDir();
    await writeFile(keyToPath(key), JSON.stringify(value), 'utf8');
  } catch {
    // Cache write failure is non-fatal; the app still works, just slower next time
  }
}

// ── Typed cache helpers — key construction for each cache domain ──────────

export function envelopeKey(account: string, folder: string): string {
  return `envelope:${account}:${folder}`;
}

export function bodyKey(account: string, folder: string, uid: number): string {
  return `body:${account}:${folder}:${uid}`;
}

export function triageKey(account: string, folder: string): string {
  return `triage:${account}:${folder}`;
}

// ── TTL helpers ────────────────────────────────────────────────────────────

export interface CachedWithTime<T> {
  data: T;
  ts: number;
}

export async function readWithTTL<T>(key: string, ttlMs: number): Promise<T | null> {
  const record = await readCache<CachedWithTime<T>>(key);
  if (!record) return null;
  if (Date.now() - record.ts > ttlMs) return null;
  return record.data;
}

export async function writeWithTime<T>(key: string, data: T): Promise<void> {
  await writeCache(key, { data, ts: Date.now() } as CachedWithTime<T>);
}

// Read without TTL expiry (for immutable data like bodies)
export async function readForever<T>(key: string): Promise<T | null> {
  const record = await readCache<CachedWithTime<T>>(key);
  return record?.data ?? null;
}

// ── Account failure tracking (for exponential backoff + 3-strikes disable) ─

export interface AccountFailureState {
  consecutiveFailures: number;
  lastFailureTs: number;   // ms epoch
  lastErrorMessage: string;
}

const FAILURE_KEY = 'account-failures';

export async function readAccountFailures(): Promise<Record<string, AccountFailureState>> {
  return (await readCache<Record<string, AccountFailureState>>(FAILURE_KEY)) ?? {};
}

export async function writeAccountFailures(map: Record<string, AccountFailureState>): Promise<void> {
  await writeCache(FAILURE_KEY, map);
}

export async function recordAccountFailure(user: string, error: string): Promise<AccountFailureState> {
  const map = await readAccountFailures();
  const prev = map[user] ?? { consecutiveFailures: 0, lastFailureTs: 0, lastErrorMessage: '' };
  const next: AccountFailureState = {
    consecutiveFailures: prev.consecutiveFailures + 1,
    lastFailureTs: Date.now(),
    lastErrorMessage: error.slice(0, 200),
  };
  map[user] = next;
  await writeAccountFailures(map);
  return next;
}

export async function recordAccountSuccess(user: string): Promise<void> {
  const map = await readAccountFailures();
  if (map[user]) {
    delete map[user];
    await writeAccountFailures(map);
  }
}

/**
 * Backoff policy: after N consecutive failures, skip the account for
 *   min(60s * 2^(N-1), 1h).
 * Returns the ms remaining before next retry (0 = can retry now).
 */
export function backoffRemainingMs(state: AccountFailureState | undefined): number {
  if (!state || state.consecutiveFailures === 0) return 0;
  const base = 60_000; // 1 minute
  const cap = 60 * 60_000; // 1 hour
  const delay = Math.min(base * Math.pow(2, state.consecutiveFailures - 1), cap);
  const remaining = (state.lastFailureTs + delay) - Date.now();
  return Math.max(0, remaining);
}
