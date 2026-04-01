import type { AgentRequest, AgentResult } from './types.js';
import { buildPrompt, spawnAgentProcess } from './spawnAgent.js';

// Spawn Cursor Agent CLI:
//   cursor agent --print --yolo --output-format text --workspace <repoPath> <prompt>
// KISS: Cursor uses its own configured model — no --model flag.
export async function spawnCursor(request: AgentRequest): Promise<AgentResult> {
  const fullPrompt = buildPrompt(request);

  const args = [
    'agent',
    '--print',
    '--yolo',
    '--output-format', 'text',
    '--workspace', request.repoPath,
    fullPrompt,
  ];

  return spawnAgentProcess('cursor', args, request);
}
