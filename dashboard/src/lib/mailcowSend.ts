import 'server-only';

import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { getAccounts, imapConfigFor, type MailcowAccount } from './mailcowImap';

const SMTP_TIMEOUT_MS = 15_000;

function resolveAccount(accountLabelOrUser: string): MailcowAccount {
  const all = getAccounts();
  const match = all.find(a => (a.label ?? a.user) === accountLabelOrUser || a.user === accountLabelOrUser);
  if (!match) throw new Error(`Account not found: ${accountLabelOrUser}`);
  return match;
}

function smtpConfigFor(acct: MailcowAccount) {
  // Mailcow default: SMTP submission on 465 (TLS) or 587 (STARTTLS).
  // Per-account overrides allowed via MailcowAccount.smtp_host/port/secure if ever added.
  const host = process.env.MAILCOW_SMTP_HOST ?? process.env.MAILCOW_IMAP_HOST;
  const port = Number(process.env.MAILCOW_SMTP_PORT ?? '465');
  const secure = (process.env.MAILCOW_SMTP_SECURE ?? 'true') !== 'false';
  if (!host) throw new Error('Missing MAILCOW_SMTP_HOST (or MAILCOW_IMAP_HOST as fallback)');
  return {
    host,
    port,
    secure,
    auth: { user: acct.user, pass: acct.pass },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  };
}

export interface SendInput {
  account: string;        // label or user of the sending account
  to: string;             // recipient (RFC-addr or plain email)
  subject: string;
  body: string;           // plain-text body
  inReplyTo?: string;     // Message-ID of the email being replied to (optional)
  references?: string;    // Space-separated list of Message-IDs (optional)
  cc?: string;
  bcc?: string;
}

/**
 * Send an email via SMTP using the sending account's credentials.
 * Returns the SMTP response info (including the new Message-ID).
 */
export async function sendEmail(input: SendInput): Promise<{ messageId: string; response: string }> {
  const acct = resolveAccount(input.account);
  const transporter = nodemailer.createTransport(smtpConfigFor(acct));

  const info = await transporter.sendMail({
    from: acct.user,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    text: input.body,
    inReplyTo: input.inReplyTo,
    references: input.references ?? input.inReplyTo,
    headers: input.inReplyTo ? { 'In-Reply-To': input.inReplyTo } : undefined,
  });

  return {
    messageId: info.messageId ?? '',
    response: info.response ?? '',
  };
}

/**
 * APPEND a draft email to the account's Drafts folder via IMAP.
 * Produces a valid RFC-822 message (via nodemailer's buildMessage) and stores it with the \Draft flag.
 */
export async function saveDraft(input: SendInput): Promise<{ uid: number | null; mailbox: string }> {
  const acct = resolveAccount(input.account);

  // Build RFC-822 via nodemailer without sending
  const transporter = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
  });
  const built = await transporter.sendMail({
    from: acct.user,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    text: input.body,
    inReplyTo: input.inReplyTo,
    references: input.references ?? input.inReplyTo,
    headers: input.inReplyTo ? { 'In-Reply-To': input.inReplyTo } : undefined,
  });
  const raw = built.message as Buffer;

  const draftsMailbox = process.env.MAILCOW_IMAP_DRAFTS_MAILBOX ?? 'Drafts';

  const client = new ImapFlow({ ...imapConfigFor(acct), socketTimeout: SMTP_TIMEOUT_MS } as any);
  await client.connect();
  try {
    const result = await client.append(draftsMailbox, raw, ['\\Draft']);
    const uid = (result as any)?.uid ?? null;
    return { uid, mailbox: draftsMailbox };
  } finally {
    await client.logout().catch(() => undefined);
  }
}
