import { NextResponse } from 'next/server';
import { getVaultRoot, getRecentRuns } from '@/lib/vault';

export const dynamic = 'force-dynamic';

export async function GET() {
  const vaultRoot = getVaultRoot();
  const runs = getRecentRuns(vaultRoot);
  return NextResponse.json({ runs });
}
