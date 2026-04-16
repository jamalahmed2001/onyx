import { NextResponse, type NextRequest } from 'next/server';
import { listEmails, resolveAccounts, getAccounts } from '@/lib/mailcowImap';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const folderParam = searchParams.get('folder');
    const accountParam = searchParams.get('account');
    const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit') ?? '20')));

    // Resolve folder: explicit param wins, then legacy 'box' param, then INBOX
    let folder: string;
    if (folderParam) {
      folder = folderParam;
    } else {
      const box = searchParams.get('box') ?? 'inbox';
      if (box === 'drafts') {
        folder = process.env.MAILCOW_IMAP_DRAFTS_MAILBOX ?? 'Drafts';
      } else {
        folder = process.env.MAILCOW_IMAP_INBOX_MAILBOX ?? 'INBOX';
      }
    }

    const accounts = accountParam ? resolveAccounts(accountParam) : getAccounts();
    const items = await listEmails({ accounts, folder, limit });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
