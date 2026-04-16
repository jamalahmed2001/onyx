import 'server-only';

import { ImapFlow } from 'imapflow';
import { getAccounts, imapConfigFor } from './mailcowImap';
import { readCache, writeCache } from './mailcowCache';

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

// Tuning knobs — mail servers (Dovecot) often rate-limit concurrent connections per IP,
// so keep concurrency modest and per-account timeout tight enough that a dead host
// never hangs the whole tree for more than ~10s.
const PER_ACCOUNT_TIMEOUT_MS = 10_000;
const CONCURRENCY = 4;
// Whole-tree hard ceiling — if discovery isn't done by this point, return what we have.
const TREE_HARD_TIMEOUT_MS = 45_000;
const MEMORY_CACHE_TTL_MS = 60_000;
const DISK_CACHE_TTL_MS = 10 * 60_000;

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

async function discoverSingleAccount(acct: { user: string; pass: string; label?: string }): Promise<AccountInfo> {
  const domain = acct.user.split('@')[1] ?? acct.user;
  const label = acct.label ?? acct.user.split('@')[0] ?? acct.user;

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
          // STATUS is cheaper than opening the mailbox — use it first
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
    return await withTimeout(task, PER_ACCOUNT_TIMEOUT_MS, `discover:${acct.user}`);
  } catch (e) {
    console.warn(`[mailcowAccounts] discover failed for ${acct.user}: ${(e as Error).message}`);
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

  // Parallel discovery with concurrency limit + per-account timeout.
  // Wrap the whole tree in a hard deadline — if some accounts are dog-slow we
  // return whatever completed rather than hanging the UI forever.
  const discovery = pMapConcurrent(accounts, CONCURRENCY, discoverSingleAccount);
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
