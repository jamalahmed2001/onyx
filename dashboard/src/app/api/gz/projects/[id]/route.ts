import { NextResponse } from 'next/server';
import { getVaultRoot } from '@/lib/vault';
import type { PhaseStatus } from '@/lib/types';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set<PhaseStatus>(['backlog', 'planning', 'ready', 'active', 'blocked', 'completed']);

export async function PATCH(req: Request) {
  const body = await req.json() as { phasePath: string; status: PhaseStatus };
  const { phasePath, status } = body;

  if (!phasePath || !status) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
  }

  const vaultRoot = getVaultRoot();
  const absPath = path.resolve(vaultRoot, phasePath);

  // Guard: prevent path traversal
  if (!absPath.startsWith(path.resolve(vaultRoot))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // Guard: if trying to manually set active, check no agent lock exists
  if (status === 'active') {
    if (fs.existsSync(absPath)) {
      try {
        const raw = fs.readFileSync(absPath, 'utf8');
        const { data } = matter(raw);
        const lockedBy = data['locked_by'] as string | undefined;
        if (lockedBy) {
          return NextResponse.json(
            { error: `Phase is locked by an active agent: ${lockedBy}. Use Kill to clear the lock first.` },
            { status: 409 }
          );
        }
      } catch { /* non-fatal — proceed */ }
    }
  }

  // Use gzos set-state as the single write path for state mutations.
  // This ensures state, tags, and status are all written consistently.
  try {
    const gzosPath = path.resolve(process.cwd(), '..', 'dist', 'cli', 'gzos.js');
    const result = execSync(
      `node "${gzosPath}" set-state "${absPath}" ${status} --json`,
      { encoding: 'utf8', timeout: 10_000 }
    );
    const parsed = JSON.parse(result);
    return NextResponse.json({ ok: true, previous: parsed.previous, new: parsed.new });
  } catch (err: unknown) {
    // Fallback: direct vault write if CLI not available
    const { updatePhaseStatus } = await import('@/lib/vault');
    const ok = updatePhaseStatus(vaultRoot, phasePath, status);
    if (!ok) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    return NextResponse.json({ ok: true, fallback: true });
  }
}
