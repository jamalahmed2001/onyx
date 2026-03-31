import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { getAllProjects } from '@/lib/vault';
import { getVaultRoot } from '@/lib/vault';

export const dynamic = 'force-dynamic';

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
}

export interface DiffResult {
  type: 'working' | 'committed';
  message?: string;        // commit message if type === 'committed'
  sha?: string;
  files: DiffFile[];
}

function parseGitDiff(output: string): DiffFile[] {
  const files: DiffFile[] = [];
  const chunks = output.split(/^diff --git /m).filter(Boolean);
  for (const chunk of chunks) {
    const lines = chunk.split('\n');
    // Determine file path
    const plusLine = lines.find(l => l.startsWith('+++ b/'));
    const minusLine = lines.find(l => l.startsWith('--- '));
    const firstLine = lines[0] ?? ''; // "a/foo b/foo"
    let filePath = plusLine ? plusLine.slice(6).trim()
      : firstLine.split(' b/').pop()?.trim() ?? 'unknown';
    if (filePath === '/dev/null' && minusLine) {
      filePath = minusLine.slice(6).trim();
    }

    // Detect status
    let status: DiffFile['status'] = 'modified';
    if (lines.some(l => l.startsWith('new file')))     status = 'added';
    if (lines.some(l => l.startsWith('deleted file'))) status = 'deleted';
    if (lines.some(l => l.startsWith('rename ')))      status = 'renamed';

    // Count +/- and collect patch lines (from first @@ onward)
    let additions = 0, deletions = 0;
    const patchLines: string[] = [];
    let inPatch = false;
    for (const line of lines) {
      if (line.startsWith('@@ ')) inPatch = true;
      if (!inPatch) continue;
      patchLines.push(line);
      if (line.startsWith('+') && !line.startsWith('+++')) additions++;
      if (line.startsWith('-') && !line.startsWith('---')) deletions++;
    }
    files.push({ path: filePath, additions, deletions, patch: patchLines.join('\n'), status });
  }
  return files;
}

function runGit(cwd: string, args: string): string {
  try {
    return execSync(`git ${args}`, { cwd, encoding: 'utf8', timeout: 15_000, stdio: ['ignore','pipe','pipe'] });
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    return (err.stdout ?? '') + (err.stderr ?? '');
  }
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const projectId = decodeURIComponent(id);
  const vaultRoot = getVaultRoot();
  const projects = getAllProjects(vaultRoot);
  const project = projects.find(p => p.id === projectId);

  if (!project?.repoPath) {
    return NextResponse.json({ error: 'Project has no repo path configured' }, { status: 404 });
  }

  const repoPath = project.repoPath;

  // Try uncommitted changes first (staged + unstaged vs HEAD)
  const workingDiff = runGit(repoPath, 'diff HEAD -U3');
  if (workingDiff.trim() && !workingDiff.startsWith('fatal')) {
    const files = parseGitDiff(workingDiff);
    if (files.length > 0) {
      return NextResponse.json({ type: 'working', files } satisfies DiffResult);
    }
  }

  // Fall back to last commit
  const sha = runGit(repoPath, 'rev-parse --short HEAD').trim();
  const message = runGit(repoPath, 'log -1 --format=%s').trim();
  const commitDiff = runGit(repoPath, 'show HEAD -U3');
  const files = parseGitDiff(commitDiff);

  return NextResponse.json({ type: 'committed', sha, message, files } satisfies DiffResult);
}
