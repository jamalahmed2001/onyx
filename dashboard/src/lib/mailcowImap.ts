import 'server-only';

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import {
  envelopeKey,
  bodyKey,
  readWithTTL,
  writeWithTime,
  readForever,
  writeCache,
} from './mailcowCache';

// Per-account IMAP socket timeout — if an account is unreachable, fail fast rather
// than hanging the whole request.
const IMAP_SOCKET_TIMEOUT_MS = 10_000;
const ENVELOPE_CACHE_TTL_MS = 2 * 60_000;

function imapConfigWithTimeout(acct: MailcowAccount) {
  return { ...imapConfigFor(acct), socketTimeout: IMAP_SOCKET_TIMEOUT_MS } as any;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${tag}`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    new Array(Math.min(limit, items.length)).fill(null).map(async () => {
      while (cursor < items.length) {
        const i = cursor++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

export type MailcowAccount = {
  label?: string;
  user: string;
  pass: string;
  // Per-account IMAP overrides. If absent, fall back to MAILCOW_IMAP_HOST/PORT/SECURE env.
  host?: string;
  port?: number;
  secure?: boolean;
  // Skip this account entirely in discovery/triage — useful for mailboxes whose
  // server isn't reachable from here or that you don't want to watch.
  disabled?: boolean;
};

export type EmailItem = {
  id: string;
  account: string;
  mailbox: string;
  uid: number;
  date: string;
  subject: string;
  from: string;
  to: string;
  seen: boolean;
  snippet?: string;
};

export type EmailBody = {
  id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  text: string;
  html: string | null;
};

// ── Config helpers (exported so mailcowAccounts.ts can reuse them) ────────────

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export function getAccounts(): MailcowAccount[] {
  let parsed: MailcowAccount[];

  // Preferred: a JSON file path (keeps secrets out of repo + avoids giant env vars)
  const path = process.env.MAILCOW_IMAP_ACCOUNTS_PATH;
  if (path) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const p = require('node:path') as typeof import('node:path');
    const abs = path.startsWith('/') ? path : p.resolve(process.cwd(), path);
    const raw = fs.readFileSync(abs, 'utf8');
    parsed = JSON.parse(raw) as MailcowAccount[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('MAILCOW_IMAP_ACCOUNTS_PATH must point to a non-empty JSON array');
    }
  } else {
    const raw = process.env.MAILCOW_IMAP_ACCOUNTS;
    if (raw) {
      parsed = JSON.parse(raw) as MailcowAccount[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('MAILCOW_IMAP_ACCOUNTS must be a non-empty JSON array');
      }
    } else {
      const user = process.env.MAILCOW_IMAP_USER;
      const pass = process.env.MAILCOW_IMAP_PASS;
      if (!user || !pass) {
        throw new Error('Missing MAILCOW_IMAP_ACCOUNTS_PATH, MAILCOW_IMAP_ACCOUNTS (JSON), or MAILCOW_IMAP_USER/PASS');
      }
      parsed = [{ user, pass, label: user }];
    }
  }

  // Filter out disabled accounts so they never get probed
  return parsed.filter(a => !a.disabled);
}

export function imapConfigFor(acct: MailcowAccount) {
  const host = acct.host ?? requireEnv('MAILCOW_IMAP_HOST');
  const port = acct.port ?? Number(process.env.MAILCOW_IMAP_PORT ?? '993');
  const secure = acct.secure ?? ((process.env.MAILCOW_IMAP_SECURE ?? 'true') !== 'false');
  return {
    host,
    port,
    secure,
    auth: { user: acct.user, pass: acct.pass },
    logger: false,
  } as const;
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

/** Resolve which accounts to operate on given an optional filter. */
export function resolveAccounts(accountFilter?: string | null): MailcowAccount[] {
  const all = getAccounts();
  if (!accountFilter) return all;
  const match = all.find(a => (a.label ?? a.user) === accountFilter || a.user === accountFilter);
  if (!match) throw new Error(`Account not found: ${accountFilter}`);
  return [match];
}

/** Resolve which accounts belong to a domain. */
export function resolveAccountsByDomain(domain: string): MailcowAccount[] {
  const all = getAccounts();
  const matches = all.filter(a => {
    const d = a.user.split('@')[1] ?? '';
    return d.toLowerCase() === domain.toLowerCase();
  });
  if (matches.length === 0) throw new Error(`No accounts for domain: ${domain}`);
  return matches;
}

function accountLabel(acct: MailcowAccount): string {
  return acct.label ?? acct.user;
}

// ── Fast envelope fetch (used by triage) ──────────────────────────────────────

async function fetchEnvelopeForAccount(acct: MailcowAccount, folder: string, limit: number): Promise<EmailItem[]> {
  const label = accountLabel(acct);
  const cacheKey = envelopeKey(label, folder);

  // Try cache first
  const cached = await readWithTTL<EmailItem[]>(cacheKey, ENVELOPE_CACHE_TTL_MS);
  if (cached) return cached.slice(0, limit);

  const items: EmailItem[] = [];
  const task = (async () => {
    const client = new ImapFlow(imapConfigWithTimeout(acct));
    await client.connect();
    try {
      const lock = await client.getMailboxLock(folder);
      try {
        const total = (client.mailbox as any).exists as number ?? 0;
        if (total === 0) return;
        const from = Math.max(1, total - limit + 1);
        const range = `${from}:*`;

        for await (const msg of client.fetch(range, { uid: true, envelope: true, flags: true, internalDate: true })) {
          if (!msg.uid || !msg.envelope) continue;
          const env = msg.envelope as any;
          const date = (msg.internalDate ?? env.date ?? new Date()).toISOString();
          const subject = env.subject ? String(env.subject) : '';
          const from_ = env.from?.[0]
            ? `${env.from[0].name ? env.from[0].name + ' ' : ''}<${env.from[0].address}>`
            : '';
          const to = env.to?.[0]
            ? `${env.to[0].name ? env.to[0].name + ' ' : ''}<${env.to[0].address}>`
            : '';
          const seen = Array.isArray(msg.flags) ? msg.flags.includes('\\Seen') : false;
          items.push({ id: `${label}:${folder}:${msg.uid}`, account: label, mailbox: folder, uid: msg.uid, date, subject, from: from_, to, seen });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
  })();

  try {
    await withTimeout(task, IMAP_SOCKET_TIMEOUT_MS, `envelope:${label}`);
  } catch {
    // Account failed — return whatever we got (possibly empty)
    return items;
  }

  // Persist cache (non-blocking)
  if (items.length > 0) writeWithTime(cacheKey, items).catch(() => {});
  return items;
}

export async function listEmailsEnvelope(opts: {
  accounts?: MailcowAccount[];
  folder?: string;
  limit?: number;
}): Promise<EmailItem[]> {
  const accounts = opts.accounts ?? getAccounts();
  const folder = opts.folder ?? process.env.MAILCOW_IMAP_INBOX_MAILBOX ?? 'INBOX';
  const limit = opts.limit ?? 30;

  // Parallel fetch with concurrency limit
  const concurrency = accounts.length === 1 ? 1 : 8;
  const perAccount = await mapConcurrent(accounts, concurrency, (acct) =>
    fetchEnvelopeForAccount(acct, folder, limit),
  );

  const all = perAccount.flat();
  all.sort((a, b) => (a.date < b.date ? 1 : -1));
  return all;
}

// ── Envelope + snippet fetch (used by list route) ─────────────────────────────

export async function listEmails(opts: {
  accounts?: MailcowAccount[];
  folder?: string;
  limit?: number;
}): Promise<EmailItem[]> {
  const accounts = opts.accounts ?? getAccounts();
  const folder = opts.folder ?? process.env.MAILCOW_IMAP_INBOX_MAILBOX ?? 'INBOX';
  const limit = opts.limit ?? 15;

  const all: EmailItem[] = [];

  for (const acct of accounts) {
    const client = new ImapFlow(imapConfigFor(acct));
    await client.connect();
    try {
      const lock = await client.getMailboxLock(folder);
      try {
        const total = (client.mailbox as any).exists as number ?? 0;
        if (total === 0) continue;
        const fromSeq = Math.max(1, total - limit + 1);
        const range = `${fromSeq}:*`;

        for await (const msg of client.fetch(range, { uid: true, envelope: true, flags: true, internalDate: true })) {
          if (!msg.uid || !msg.envelope) continue;
          const env = msg.envelope as any;
          const date = (msg.internalDate ?? env.date ?? new Date()).toISOString();
          const subject = env.subject ? String(env.subject) : '';
          const from = env.from?.[0]
            ? `${env.from[0].name ? env.from[0].name + ' ' : ''}<${env.from[0].address}>`
            : '';
          const to = env.to?.[0]
            ? `${env.to[0].name ? env.to[0].name + ' ' : ''}<${env.to[0].address}>`
            : '';
          const seen = Array.isArray(msg.flags) ? msg.flags.includes('\\Seen') : false;

          let snippet: string | undefined;
          try {
            const source = await client.download(msg.uid, undefined, { uid: true });
            const parsed = await simpleParser(source.content, { skipHtmlToText: true });
            const text = (parsed.text ?? '').trim().replace(/\s+/g, ' ');
            snippet = text ? text.slice(0, 180) : undefined;
          } catch {
            // ignore
          }

          const label = accountLabel(acct);
          all.push({ id: `${label}:${folder}:${msg.uid}`, account: label, mailbox: folder, uid: msg.uid, date, subject, from, to, seen, snippet });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  all.sort((a, b) => (a.date < b.date ? 1 : -1));
  return all;
}

// ── Full body fetch (cached forever — message bodies don't change) ──────────

export async function getEmailBody(account: string, mailbox: string, uid: number): Promise<EmailBody> {
  const cacheKey = bodyKey(account, mailbox, uid);

  const cached = await readForever<EmailBody>(cacheKey);
  if (cached) return cached;

  const accounts = getAccounts();
  const acct = accounts.find(a => (a.label ?? a.user) === account || a.user === account);
  if (!acct) throw new Error(`Account not found: ${account}`);

  const client = new ImapFlow(imapConfigWithTimeout(acct));
  await client.connect();
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const source = await client.download(uid, undefined, { uid: true });
      const parsed = await simpleParser(source.content);
      const body: EmailBody = {
        id: `${account}:${mailbox}:${uid}`,
        subject: (parsed.subject ?? '').toString(),
        from: parsed.from?.text ?? '',
        to: parsed.to?.text ?? '',
        date: (parsed.date ?? new Date()).toISOString(),
        text: (parsed.text ?? '').trim(),
        html: parsed.html || null,
      };
      // Persist cache (immutable — no TTL)
      writeCache(cacheKey, { data: body, ts: Date.now() }).catch(() => {});
      return body;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
}

// ── Summary (unread + drafts, per account) ────────────────────────────────────

export type AccountSummary = {
  account: string;
  domain: string;
  unread: number;
  drafts: number;
};

export async function getEmailSummary(): Promise<{ unread: number; drafts: number; accounts: AccountSummary[] }> {
  const accounts = getAccounts();
  const inboxMb = process.env.MAILCOW_IMAP_INBOX_MAILBOX ?? 'INBOX';
  const draftsMb = process.env.MAILCOW_IMAP_DRAFTS_MAILBOX ?? 'Drafts';

  let totalUnread = 0;
  let totalDrafts = 0;
  const perAccount: AccountSummary[] = [];

  for (const acct of accounts) {
    const client = new ImapFlow(imapConfigFor(acct));
    await client.connect();
    let unread = 0;
    let drafts = 0;
    try {
      {
        const lock = await client.getMailboxLock(inboxMb);
        try {
          const mb = client.mailbox as any;
          if (typeof mb.unseen === 'number') unread = mb.unseen;
          else {
            const unseenUids = await client.search({ seen: false }) as number[];
            unread = unseenUids.length;
          }
        } finally { lock.release(); }
      }
      {
        const lock = await client.getMailboxLock(draftsMb).catch(() => null);
        if (lock) {
          try {
            const mb = client.mailbox as any;
            if (typeof mb.exists === 'number') drafts = mb.exists;
            else { const all = await client.search({}) as number[]; drafts = all.length; }
          } finally { lock.release(); }
        }
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
    totalUnread += unread;
    totalDrafts += drafts;
    const domain = acct.user.split('@')[1] ?? acct.user;
    perAccount.push({ account: accountLabel(acct), domain, unread, drafts });
  }

  return { unread: totalUnread, drafts: totalDrafts, accounts: perAccount };
}
