import { NextResponse } from 'next/server';
import { getVaultRoot, readVaultFile, writeVaultFile } from '@/lib/vault';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const relPath = searchParams.get('path');
  if (!relPath) return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  const vaultRoot = getVaultRoot();
  const result = readVaultFile(vaultRoot, relPath);
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(result);
}

export async function PUT(req: Request) {
  const { searchParams } = new URL(req.url);
  const relPath = searchParams.get('path');
  if (!relPath) return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  const { content } = await req.json() as { content: string };
  const vaultRoot = getVaultRoot();
  const ok = writeVaultFile(vaultRoot, relPath, content);
  if (!ok) return NextResponse.json({ error: 'Write failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
