import type { ControllerConfig } from '../config/load.js';
import { chatCompletion } from './client.js';
import { spawnClaudeCode } from '../agents/claudeCodeSpawn.js';

/**
 * Route a planning LLM call to the best available model:
 *
 *   claude-code + valid repoPath → spawnClaudeCode with --add-dir
 *     The agent has live filesystem access and can read, grep, and explore
 *     the repo before writing the plan. Far better than a static file tree.
 *
 *   otherwise → chatCompletion (OpenRouter)
 *     Falls back to direct API call with the file tree embedded in the prompt.
 */
export async function planningCall(opts: {
  config: ControllerConfig;
  repoPath: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}): Promise<string> {
  const { config, repoPath, systemPrompt, userPrompt, maxTokens } = opts;

  if (config.agentDriver === 'claude-code' && repoPath) {
    const result = await spawnClaudeCode({
      prompt: userPrompt,
      repoPath,
      systemPrompt,
      timeoutMs: 120_000, // planning is fast — 2 min ceiling
      model: config.llm.model,
    });
    if (!result.success) {
      throw new Error(`Planning agent failed: ${result.error ?? result.output.slice(0, 300)}`);
    }
    return result.output;
  }

  // Fallback: direct OpenRouter call
  const apiKey = config.llm.apiKey ?? process.env['OPENROUTER_API_KEY'];
  if (!apiKey) throw new Error('planningCall: no API key — set OPENROUTER_API_KEY');

  return chatCompletion({
    model: config.llm.model,
    apiKey,
    baseUrl: config.llm.baseUrl,
    maxTokens: maxTokens ?? 3000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
}

/** True when planning calls will go through the agent driver (no OpenRouter key needed). */
export function planningUsesAgent(config: ControllerConfig, repoPath: string): boolean {
  return config.agentDriver === 'claude-code' && Boolean(repoPath);
}
