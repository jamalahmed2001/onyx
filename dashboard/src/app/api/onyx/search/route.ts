import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getVaultRoot } from '@/lib/vault';

export const dynamic = 'force-dynamic';

export interface SearchHit {
  path: string;       // relative path
  label: string;      // filename without .md
  folder: string;     // parent folder display (e.g. "Fanvue / Phases")
  fileType: 'phase' | 'overview' | 'hub' | 'kanban' | 'knowledge' | 'log' | 'note';
  context: string;    // best matching snippet (plain text, ~120 chars)
  matchIn: 'title' | 'content';
  score: number;
}

// Lines to skip — not useful as context
const NOISE_LINE = /^(\s*---\s*|\s*\|[-|: ]+\|\s*|#+\s*🔗\s*Navigation|tags:|aliases:|status:|type:|date:|phase_status_tag:|created:|project:|repo_path:|domain:)/i;
const NAV_LINK_LINE = /^\s*-\s*\[\[/;

function inferFileType(relPath: string, label: string): SearchHit['fileType'] {
  const lower = label.toLowerCase();
  if (/overview/i.test(lower)) return 'overview';
  if (/hub/i.test(lower)) return 'hub';
  if (/kanban/i.test(lower)) return 'kanban';
  if (/knowledge|knowledgebase/i.test(lower)) return 'knowledge';
  if (/\/Phases\//i.test(relPath) || /^Phase\s+\d+/i.test(label)) return 'phase';
  if (/\/Logs\//i.test(relPath) || /log/i.test(lower)) return 'log';
  return 'note';
}

function folderLabel(relPath: string): string {
  const parts = relPath.split('/');
  if (parts.length <= 1) return 'Root';
  // Skip file itself (last), show up to last 2 folder parts
  const folders = parts.slice(0, -1);
  return folders.slice(-2).join(' / ');
}

function stripFrontmatter(content: string): { body: string; bodyStart: number } {
  if (!content.startsWith('---')) return { body: content, bodyStart: 0 };
  const end = content.indexOf('\n---', 3);
  if (end === -1) return { body: content, bodyStart: 0 };
  const bodyStart = content.indexOf('\n', end + 1) + 1;
  return { body: content.slice(bodyStart), bodyStart };
}

function isNavSection(lines: string[], lineIdx: number): boolean {
  // Walk back from lineIdx to see if we're inside a ## 🔗 Navigation section
  for (let i = lineIdx; i >= 0; i--) {
    const l = lines[i];
    if (/^##\s+🔗\s*Navigation/i.test(l)) return true;
    if (/^##\s+/i.test(l)) return false; // different section
  }
  return false;
}

function bestContext(content: string, query: string, maxLen = 130): { text: string; matchIn: 'title' | 'content' } {
  const { body } = stripFrontmatter(content);
  const lines = body.split('\n');
  const qLower = query.toLowerCase();

  // Score each line: prefer h1/h2/h3, penalise noise/nav
  let best = { score: -1, text: '', idx: -1 };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (NOISE_LINE.test(trimmed)) continue;
    if (NAV_LINK_LINE.test(trimmed)) continue;
    if (trimmed === '---') continue;
    if (isNavSection(lines, i)) continue;

    const lower = trimmed.toLowerCase();
    if (!lower.includes(qLower)) continue;

    let score = 1;
    if (/^# /.test(trimmed)) score += 8;
    else if (/^## /.test(trimmed)) score += 5;
    else if (/^### /.test(trimmed)) score += 3;

    // Boost if near top of file
    if (i < 20) score += Math.max(0, 4 - Math.floor(i / 5));

    if (score > best.score) {
      best = { score, text: trimmed.replace(/^#+\s*/, ''), idx: i };
    }
  }

  if (best.idx === -1) return { text: '', matchIn: 'content' };

  const isHeading = /^#{1,3}\s/.test(lines[best.idx].trim());
  const text = best.text.slice(0, maxLen) + (best.text.length > maxLen ? '…' : '');
  return { text, matchIn: isHeading ? 'title' : 'content' };
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const vaultRoot = getVaultRoot();
  if (!fs.existsSync(vaultRoot)) return NextResponse.json({ hits: [] });

  // Sanitise query for shell (strip special chars except - and space)
  const safeQ = q.replace(/[^a-zA-Z0-9\s\-_.]/g, '').trim().slice(0, 100);
  if (!safeQ) return NextResponse.json({ hits: [] });

  // Run grep: list matching files only (-l) to avoid parsing tons of lines
  // Then for each file we score and read ourselves
  const grepCmd = `grep -r -i -l --include="*.md" \
    --exclude-dir=".git" --exclude-dir=".obsidian" \
    --exclude-dir="node_modules" --exclude-dir=".trash" \
    --exclude-dir=".onyx-backups" --exclude-dir="dist" \
    -e ${JSON.stringify(safeQ)} .`;

  let matchedFiles: string[] = [];
  try {
    const raw = execSync(grepCmd, {
      cwd: vaultRoot,
      encoding: 'utf8',
      timeout: 8_000,
      maxBuffer: 1024 * 256,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    matchedFiles = raw.split('\n').map(s => s.trim()).filter(s => s.endsWith('.md'));
  } catch (e: unknown) {
    const err = e as { stdout?: string; code?: number };
    if (err.code === 1) {
      matchedFiles = (err.stdout ?? '').split('\n').map(s => s.trim()).filter(s => s.endsWith('.md'));
    }
  }

  if (matchedFiles.length === 0) return NextResponse.json({ hits: [] });

  const qLower = q.toLowerCase();
  const hits: SearchHit[] = [];

  for (const relRaw of matchedFiles.slice(0, 80)) {
    // Strip leading "./"
    const rel = relRaw.replace(/^\.\//, '');
    const absPath = path.join(vaultRoot, rel);

    let content = '';
    try { content = fs.readFileSync(absPath, 'utf8'); }
    catch { continue; }

    const label = path.basename(rel, '.md');
    const fileType = inferFileType(rel, label);
    const folder = folderLabel(rel);
    const labelLower = label.toLowerCase();

    // Score: filename match is the strongest signal
    let score = 0;
    if (labelLower === qLower) score += 20;
    else if (labelLower.includes(qLower)) score += 12;
    else if (qLower.split(/\s+/).every(w => labelLower.includes(w))) score += 8;

    // Boost by file type importance
    if (fileType === 'overview' || fileType === 'hub') score += 4;
    else if (fileType === 'phase') score += 2;
    else if (fileType === 'kanban') score += 2;

    const { text: contextText, matchIn } = bestContext(content, q);
    if (contextText) {
      if (matchIn === 'title') score += 6;
      else score += 1;
    }

    hits.push({ path: rel, label, folder, fileType, context: contextText, matchIn, score });
  }

  // Sort by score descending, then alphabetically
  hits.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

  return NextResponse.json({ hits: hits.slice(0, 15) });
}
