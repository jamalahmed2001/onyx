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
      // fallback: staged + unstaged
      const staged = execSync('git diff --cached --name-only', { cwd: repoPath, encoding: 'utf-8', timeout: 5000 });
      const unstaged = execSync('git diff --name-only', { cwd: repoPath, encoding: 'utf-8', timeout: 5000 });
      return [...new Set([...staged.trim().split('\n'), ...unstaged.trim().split('\n')].filter(Boolean))];
    } catch {
      return [];
    }
  }
}

// Spawn Claude Code CLI agent:
// claude --print "<prompt>" [--add-dir <repoPath>]
// Captures stdout. Times out after request.timeoutMs.
export async function spawnClaudeCode(request: AgentRequest): Promise<AgentResult> {
  const startTime = Date.now();
  const timeoutMs = request.timeoutMs ?? 600_000;

  const fullPrompt = request.context
    ? `${request.context}\n\n---\n\n${request.prompt}`
    : request.prompt;

  // claude CLI uses bare model IDs — strip vendor prefix from OpenRouter-format names
  // e.g. "anthropic/claude-haiku-4-5-20251001" → "claude-haiku-4-5-20251001"
  const claudeModel = request.model?.replace(/^[^/]+\//, '');

  const args = [
    '--dangerously-skip-permissions',
    '--output-format', 'text',
    '--print', fullPrompt,
    '--add-dir', request.repoPath,
    ...(claudeModel ? ['--model', claudeModel] : []),
    ...(request.systemPrompt ? ['--append-system-prompt', request.systemPrompt] : []),
  ];

  return new Promise<AgentResult>((resolve) => {
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    const child = spawn('claude', args, {
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
        resolve({
          success: false,
          output,
          filesChanged: [],
          error: `Timed out after ${timeoutMs}ms`,
          durationMs,
        });
        return;
      }

      if (code !== 0) {
        resolve({
          success: false,
          output,
          filesChanged: [],
          error: errOutput || `Process exited with code ${code}`,
          durationMs,
        });
        return;
      }

      // Use git diff to find changed files (more reliable than stdout parsing)
      const filesChanged = getChangedFiles(request.repoPath);

      resolve({
        success: true,
        output,
        filesChanged,
        durationMs,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        output: '',
        filesChanged: [],
        error: err.message,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

