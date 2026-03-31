import fs from 'fs';
import path from 'path';

export interface ResolveRepoPathArgs {
  projectId: string;
  explicitRepoPath?: string;
  reposRoot?: string;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_/]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '');
}

function scoreMatch(needle: string, candidate: string): number {
  // Higher is better
  if (!needle || !candidate) return 0;
  if (candidate === needle) return 100;
  if (candidate.includes(needle)) return 80;
  // token overlap
  const nTokens = new Set(needle.split(/[-_/]/).filter(Boolean));
  const cTokens = new Set(candidate.split(/[-_/]/).filter(Boolean));
  let overlap = 0;
  for (const t of nTokens) if (cTokens.has(t)) overlap++;
  return overlap * 10;
}

export function resolveRepoPath(args: ResolveRepoPathArgs): { repoPath: string; source: 'explicit' | 'fuzzy' | 'none' } {
  const { projectId, explicitRepoPath, reposRoot } = args;

  if (explicitRepoPath && fs.existsSync(explicitRepoPath)) {
    return { repoPath: explicitRepoPath, source: 'explicit' };
  }

  if (!reposRoot || !fs.existsSync(reposRoot)) {
    return { repoPath: '', source: 'none' };
  }

  const needle = norm(projectId);

  let best: { p: string; s: number } | null = null;
  const entries = fs.readdirSync(reposRoot, { withFileTypes: true });

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const candidateName = ent.name;
    const candidateNorm = norm(candidateName);
    const s = scoreMatch(needle, candidateNorm);
    if (s <= 0) continue;
    const p = path.join(reposRoot, candidateName);
    if (!fs.existsSync(p)) continue;
    if (!best || s > best.s) best = { p, s };
  }

  if (!best) return { repoPath: '', source: 'none' };
  return { repoPath: best.p, source: 'fuzzy' };
}
