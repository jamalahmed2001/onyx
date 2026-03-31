import { spawn, execSync } from 'child_process';
import type { AgentRequest, AgentResult } from './types.js';

const MAX_OUTPUT = 2 * 1024 * 1024; // 2MB

function getChangedFiles(repoPath: string): string[] {
  try {
    const result = execSync('git diff --name-only HEAD', {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 5000,
    });
    return result.trim().split('\n').filter(Boolean);
  } catch {
    try {
      const staged = execSync('git diff --cached --name-only', { cwd: repoPath, encoding: 'utf-8', timeout: 5000 });
      const unstaged = execSync('git diff --name-only', { cwd: repoPath, encoding: 'utf-8', timeout: 5000 });
      return [...new Set([...staged.trim().split('\n'), ...unstaged.trim().split('\n')].filter(Boolean))];
    } catch {
      return [];
    }
  }
}

// Spawn Cursor Agent CLI:
//   cursor agent --print --yolo --workspace <repoPath> "<prompt>"
// KISS: do not pass model names — Cursor uses its own configured default.
export async function spawnCursor(request: AgentRequest): Promise<AgentResult> {
  const startTime = Date.now();
  const timeoutMs = request.timeoutMs ?? 600_000;

  const fullPrompt = request.context
    ? `${request.context}\n\n---\n\n${request.prompt}`
    : request.prompt;

  const args = [
    'agent',
    '--print',
    '--yolo',
    '--output-format', 'text',
    '--workspace', request.repoPath,
    fullPrompt,
  ];

  return new Promise<AgentResult>((resolve) => {
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    const child = spawn('cursor', args, {
      cwd: request.repoPath,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    let outputSize = 0;
    let errSize = 0;
    child.stdout.on('data', (chunk: Buffer) => {
      if (outputSize < MAX_OUTPUT) {
        chunks.push(chunk);
        outputSize += chunk.length;
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (errSize < MAX_OUTPUT) {
        errChunks.push(chunk);
        errSize += chunk.length;
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      const output = Buffer.concat(chunks).toString('utf-8');
      const errOutput = Buffer.concat(errChunks).toString('utf-8');

      if (timedOut) {
        resolve({ success: false, output, filesChanged: [], error: `Timed out after ${timeoutMs}ms`, durationMs });
        return;
      }

      if (code !== 0) {
        resolve({ success: false, output, filesChanged: [], error: errOutput || `Process exited with code ${code}`, durationMs });
        return;
      }

      const filesChanged = getChangedFiles(request.repoPath);
      resolve({ success: true, output, filesChanged, durationMs });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ success: false, output: '', filesChanged: [], error: err.message, durationMs: Date.now() - startTime });
    });
  });
}
