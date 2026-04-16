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
