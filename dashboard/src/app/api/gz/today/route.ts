import { NextResponse } from 'next/server';
import { getVaultRoot, getDailyPlan, getInboxItems } from '@/lib/vault';

export const dynamic = 'force-dynamic';

export async function GET() {
  const vaultRoot = getVaultRoot();
  const plan = getDailyPlan(vaultRoot);
  const inbox = getInboxItems(vaultRoot);
  return NextResponse.json({ plan, inbox });
}
