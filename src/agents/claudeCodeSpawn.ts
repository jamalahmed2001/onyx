import type { AgentRequest, AgentResult } from './types.js';
import { buildPrompt, spawnAgentProcess } from './spawnAgent.js';

// Spawn Claude Code CLI:
//   claude --dangerously-skip-permissions --output-format text --print <prompt> --add-dir <repoPath>
export async function spawnClaudeCode(request: AgentRequest): Promise<AgentResult> {
  const fullPrompt = buildPrompt(request);

  // Claude CLI uses bare model IDs — strip vendor prefix from OpenRouter format
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

  return spawnAgentProcess('claude', args, request);
}
