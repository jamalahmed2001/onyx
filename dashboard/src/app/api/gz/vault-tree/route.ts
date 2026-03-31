import { NextResponse } from 'next/server';
import { getVaultRoot, buildVaultTree } from '@/lib/vault';

export const dynamic = 'force-dynamic';

export async function GET() {
  const vaultRoot = getVaultRoot();
  const tree = buildVaultTree(vaultRoot);
  return NextResponse.json({ tree, vaultRoot });
}
