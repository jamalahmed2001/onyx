import { NextResponse } from 'next/server';
import { getVaultRoot } from '@/lib/vault';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const relPath = searchParams.get('path');
  if (!relPath) return NextResponse.json({ error: 'Missing path' }, { status: 400 });

  const vaultRoot = getVaultRoot();
  const filePath = path.resolve(vaultRoot, relPath);
  if (!filePath.startsWith(path.resolve(vaultRoot))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const dir = path.dirname(filePath);
  try {
    const entries = fs.readdirSync(dir);
    const files = entries
      .filter(f => f.endsWith('.md'))
      .sort()
      .map(f => ({
        name: f.replace(/\.md$/, ''),
        path: path.relative(vaultRoot, path.join(dir, f)),
      }));
    return NextResponse.json({ files });
  } catch {
    return NextResponse.json({ files: [] });
  }
}
