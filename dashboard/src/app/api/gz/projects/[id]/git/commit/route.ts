import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { getAllProjects, getVaultRoot } from '@/lib/vault';

export const dynamic = 'force-dynamic';

function runGit(cwd: string, cmd: string): { out: string; ok: boolean } {
  try {
    const out = execSync(`git ${cmd}`, { cwd, encoding: 'utf8', timeout: 20_000, stdio: ['ignore','pipe','pipe'] });
    return { out: out.toString(), ok: true };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    return { out: (err.stdout ?? '') + (err.stderr ?? ''), ok: false };
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const projectId = decodeURIComponent(id);
  const { message } = await req.json() as { message: string };

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Commit message required' }, { status: 400 });
  }

  const vaultRoot = getVaultRoot();
  const projects = getAllProjects(vaultRoot);
  const project = projects.find(p => p.id === projectId);

  if (!project?.repoPath) {
    return NextResponse.json({ error: 'Project has no repo path' }, { status: 404 });
  }

  const repoPath = project.repoPath;

  // Stage all changes
  const add = runGit(repoPath, 'add -A');
  if (!add.ok && !add.out.includes('nothing to commit')) {
    return NextResponse.json({ error: `git add failed: ${add.out}` }, { status: 500 });
  }

  // Commit
  const safeMsgArg = JSON.stringify(message.trim().replace(/"/g, '\\"'));
  const commit = runGit(repoPath, `commit -m ${safeMsgArg}`);

  if (!commit.ok && !commit.out.includes('nothing to commit')) {
    return NextResponse.json({ error: `git commit failed: ${commit.out}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, output: commit.out });
}
