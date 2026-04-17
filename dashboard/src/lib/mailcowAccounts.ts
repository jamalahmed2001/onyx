import 'server-only';

import { ImapFlow } from 'imapflow';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getAccounts, imapConfigFor, type MailcowAccount } from './mailcowImap';
import {
  readCache,
  writeCache,
  readAccountFailures,
  recordAccountFailure,
  recordAccountSuccess,
  backoffRemainingMs,
  type AccountFailureState,
} from './mailcowCache';

export type FolderInfo = {
  name: string;
  display: string;
};

export type AccountInfo = {
  user: string;
  label: string;
  domain: string;
  folders: FolderInfo[];
  unread: number;
  connected: boolean;
};

export type DomainInfo = {
  domain: string;
  accounts: AccountInfo[];
  totalUnread: number;
};

const HIDDEN_FOLDER_FLAGS = new Set(['\\Noselect', '\\NonExistent']);

const DISPLAY_NAME: Record<string, string> = {
  INBOX: 'Inbox',
  Drafts: 'Drafts',
  Sent: 'Sent',
  'Sent Mail': 'Sent',
  'Sent Items': 'Sent',
  Junk: 'Junk',
  'Junk Email': 'Junk',
  Spam: 'Spam',
  Trash: 'Trash',
  'Deleted Items': 'Trash',
  Archive: 'Archive',
};

function toDisplay(name: string): string {
  const stripped = name.replace(/^INBOX[./]/i, '');
  return DISPLAY_NAME[stripped] ?? DISPLAY_NAME[name] ?? stripped;
}

// Tuning knobs — mail servers (Dovecot / mailcow fail2ban) rate-limit aggressively
// on repeated auth attempts from one IP. Keep concurrency at 2 to minimise the
// risk of tripping the recidive jail (which hard-bans for 1 week).
const PER_ACCOUNT_TIMEOUT_MS = 10_000;
const CONCURRENCY = 2;
// Whole-tree hard ceiling — if discovery isn't done by this point, return what we have.
const TREE_HARD_TIMEOUT_MS = 45_000;
const MEMORY_CACHE_TTL_MS = 60_000;
const DISK_CACHE_TTL_MS = 10 * 60_000;

// Auto-disable threshold: after N consecutive failures, mark the account
// `disabled: true` in mailcow-accounts.json so it's never probed again.
const FAILURE_DISABLE_THRESHOLD = 3;

let memCache: { tree: DomainInfo[]; ts: number } | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${tag}`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function pMapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Auto-disable an account in mailcow-accounts.json by setting `disabled: true`.
 * Atomic write (temp file + rename) so a concurrent reader never sees a partial file.
 * Preserves all other fields and accounts untouched.
 */
async function disableAccountInJson(user: string, reason: string): Promise<void> {
  const jsonPath = process.env.MAILCOW_IMAP_ACCOUNTS_PATH;
  if (!jsonPath) {
    console.warn(`[mailcowAccounts] can't auto-disable ${user}: MAILCOW_IMAP_ACCOUNTS_PATH not set`);
    return;
  }
  const abs = jsonPath.startsWith('/') ? jsonPath : path.resolve(process.cwd(), jsonPath);
  try {
    const raw = await readFile(abs, 'utf8');
    const accounts = JSON.parse(raw) as MailcowAccount[];
    let changed = false;
    for (const a of accounts) {
      if (a.user === user && !a.disabled) {
        a.disabled = true;
        // Leave a breadcrumb for the operator
        (a as MailcowAccount & { disabled_at?: string; disabled_reason?: string }).disabled_at = new Date().toISOString();
        (a as MailcowAccount & { disabled_at?: string; disabled_reason?: string }).disabled_reason = reason;
        changed = true;
      }
    }
    if (!changed) return;
    const tmp = abs + '.tmp';
    await writeFile(tmp, JSON.stringify(accounts, null, 2), 'utf8');
    const fs = await import('node:fs/promises');
    await fs.rename(tmp, abs);
    console.warn(`[mailcowAccounts] auto-disabled ${user} after ${FAILURE_DISABLE_THRESHOLD} consecutive failures — reason: ${reason}`);
  } catch (e) {
    console.warn(`[mailcowAccounts] failed to update accounts JSON for ${user}: ${(e as Error).message}`);
  }
}

async function discoverSingleAccount(
  acct: MailcowAccount,
  failureMap: Record<string, AccountFailureState>,
): Promise<AccountInfo> {
  const domain = acct.user.split('@')[1] ?? acct.user;
  const label = acct.label ?? acct.user.split('@')[0] ?? acct.user;

  // Backoff: if this account recently failed, skip it until its cooldown elapses.
  const existing = failureMap[acct.user];
  const remaining = backoffRemainingMs(existing);
  if (remaining > 0) {
    return { user: acct.user, label, domain, folders: [], unread: 0, connected: false };
  }

  const task = (async (): Promise<AccountInfo> => {
    const client = new ImapFlow({
      ...imapConfigFor(acct),
      socketTimeout: PER_ACCOUNT_TIMEOUT_MS,
    } as any);
    await client.connect();
    try {
      const listed = await client.list();
      const folders: FolderInfo[] = listed
        .filter(f => !f.flags || ![...f.flags].some(flag => HIDDEN_FOLDER_FLAGS.has(flag)))
        .map(f => ({ name: f.path, display: toDisplay(f.path) }));

      folders.sort((a, b) => {
        if (a.name === 'INBOX') return -1;
        if (b.name === 'INBOX') return 1;
        return a.display.localeCompare(b.display);
      });

      let unread = 0;
      if (folders.find(f => f.name === 'INBOX')) {
        try {
          const status = await client.status('INBOX', { unseen: true }) as { unseen?: number };
          if (typeof status.unseen === 'number') unread = status.unseen;
        } catch {
          // status not supported — fall through with unread=0
        }
      }
      return { user: acct.user, label, domain, folders, unread, connected: true };
    } finally {
      await client.logout().catch(() => {});
    }
  })();

  try {
    const result = await withTimeout(task, PER_ACCOUNT_TIMEOUT_MS, `discover:${acct.user}`);
    // Success: clear any failure state
    await recordAccountSuccess(acct.user);
    return result;
  } catch (e) {
    const msg = (e as Error).message;
    console.warn(`[mailcowAccounts] discover failed for ${acct.user}: ${msg}`);
    // Record failure + decide whether to auto-disable
    const state = await recordAccountFailure(acct.user, msg);
    if (state.consecutiveFailures >= FAILURE_DISABLE_THRESHOLD) {
      await disableAccountInJson(acct.user, msg);
    }
    return { user: acct.user, label, domain, folders: [], unread: 0, connected: false };
  }
}

export async function getAccountTree(forceRefresh = false): Promise<DomainInfo[]> {
  // Level 1: in-memory cache (fastest)
  if (!forceRefresh && memCache && Date.now() - memCache.ts < MEMORY_CACHE_TTL_MS) {
    return memCache.tree;
  }

  // Level 2: disk cache (survives dev-server hot reloads)
  if (!forceRefresh) {
    const diskCached = await readCache<{ tree: DomainInfo[]; ts: number }>('account-tree');
    if (diskCached && Date.now() - diskCached.ts < DISK_CACHE_TTL_MS) {
      memCache = diskCached;
      return diskCached.tree;
    }
  }

  const accounts = getAccounts();
  const failureMap = await readAccountFailures();

  // Parallel discovery with concurrency limit + per-account timeout.
  // Wrap the whole tree in a hard deadline — if some accounts are dog-slow we
  // return whatever completed rather than hanging the UI forever.
  const discovery = pMapConcurrent(accounts, CONCURRENCY, (a) => discoverSingleAccount(a, failureMap));
  const infos: AccountInfo[] = await Promise.race([
    discovery,
    new Promise<AccountInfo[]>((resolve) => {
      setTimeout(() => {
        console.warn(`[mailcowAccounts] tree discovery exceeded ${TREE_HARD_TIMEOUT_MS}ms — returning partial results`);
        // Return a best-effort placeholder array for unreachable accounts so the UI
        // still renders the rest. Any still-running probes will populate the cache
        // on next iteration.
        const placeholder: AccountInfo[] = accounts.map(a => ({
          user: a.user,
          label: a.label ?? a.user.split('@')[0] ?? a.user,
          domain: a.user.split('@')[1] ?? a.user,
          folders: [],
          unread: 0,
          connected: false,
        }));
        resolve(placeholder);
      }, TREE_HARD_TIMEOUT_MS);
    }),
  ]);

  // Group by domain, preserve insertion order
  const domainMap = new Map<string, AccountInfo[]>();
  for (const info of infos) {
    const list = domainMap.get(info.domain) ?? [];
    list.push(info);
    domainMap.set(info.domain, list);
  }

  const tree: DomainInfo[] = Array.from(domainMap.entries()).map(([domain, accts]) => ({
    domain,
    accounts: accts,
    totalUnread: accts.reduce((sum, a) => sum + a.unread, 0),
  }));

  const record = { tree, ts: Date.now() };
  memCache = record;
  writeCache('account-tree', record).catch(() => {});
  return tree;
}
