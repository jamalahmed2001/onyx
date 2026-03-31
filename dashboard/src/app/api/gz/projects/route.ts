import { NextResponse } from 'next/server';
import { getVaultRoot, getAllProjects } from '@/lib/vault';

export const dynamic = 'force-dynamic';

export async function GET() {
  const vaultRoot = getVaultRoot();
  const projects = getAllProjects(vaultRoot);
  return NextResponse.json({ projects, vaultRoot });
}
