import { NextResponse, type NextRequest } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getVaultRoot } from '@/lib/vault';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json() as { text: string };
  const text = body.text?.trim();
  if (!text) return NextResponse.json({ error: 'empty' }, { status: 400 });

  const ts = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const item = `\n- [ ] [${ts}] ${text}`;

  const inboxPath = join(getVaultRoot(), '00 - Dashboard', 'Inbox.md');
  try {
    const existing = readFileSync(inboxPath, 'utf-8');
    writeFileSync(inboxPath, existing.trimEnd() + item + '\n', 'utf-8');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
