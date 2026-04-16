import { NextResponse, type NextRequest } from 'next/server';
import { getAccountTree } from '@/lib/mailcowAccounts';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const refresh = new URL(req.url).searchParams.get('refresh') === '1';
    const domains = await getAccountTree(refresh);
    return NextResponse.json({ domains });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
