import fs from 'fs';
import path from 'path';
import { chatCompletion } from '../llm/client.js';
import type { ControllerConfig } from '../config/load.js';

/**
 * After a phase completes, call a small LLM (light tier) to extract a one-liner
 * learning and append it to the project's Knowledge.md.
 *
 * This is best-effort — never throws, never blocks the controller.
 */
export async function appendPhaseKnowledge(opts: {
  projectId: string;
  phaseNum: string;
  phaseLabel: string;
  phaseNotePath: string;
  logNotePath: string;
  bundleDir: string;
  config: ControllerConfig;
}): Promise<void> {
  const { projectId, phaseNum, phaseLabel, phaseNotePath, logNotePath, bundleDir, config } = opts;

  const apiKey = config.llm.apiKey ?? process.env['OPENROUTER_API_KEY'];
  if (!apiKey) return; // no key = skip silently

  const knowledgePath = path.join(bundleDir, `${projectId} - Knowledge.md`);
  if (!fs.existsSync(knowledgePath)) return;

  try {
    // Read the phase note and the tail of the log note for context
    const phaseContent = fs.existsSync(phaseNotePath)
      ? fs.readFileSync(phaseNotePath, 'utf8').slice(0, 3000)
      : '';
    const logTail = fs.existsSync(logNotePath)
      ? fs.readFileSync(logNotePath, 'utf8').slice(-2000)
      : '';

    if (!phaseContent && !logTail) return;

    const model = config.modelTiers?.light ?? 'anthropic/claude-haiku-4-5-20251001';

    const response = await chatCompletion({
      model,
      apiKey,
      baseUrl: config.llm.baseUrl,
      maxTokens: 200,
      messages: [
        {
          role: 'system',
          content: 'You extract concise project learnings. Output exactly 1-2 sentences. No preamble, no bullet point, just the learning as plain text.',
        },
        {
          role: 'user',
          content: `Phase P${phaseNum} — ${phaseLabel} just completed for project "${projectId}".\n\nPhase note:\n${phaseContent}\n\nExecution log tail:\n${logTail}\n\nWhat is the single most useful thing a future agent should know from this phase? (patterns established, gotchas hit, decisions made, constraints discovered)`,
        },
      ],
    });

    const learning = response.trim();
    if (!learning) return;

    // Append to ## Learnings section
    const existing = fs.readFileSync(knowledgePath, 'utf8');
    const today = new Date().toISOString().slice(0, 10);
    const entry = `\n- **P${phaseNum}** (${today}): ${learning}`;

    const learnIdx = existing.indexOf('## Learnings');
    if (learnIdx === -1) {
      fs.appendFileSync(knowledgePath, `\n\n## Learnings\n${entry}\n`);
    } else {
      // Insert after the ## Learnings heading
      const afterHeading = existing.indexOf('\n', learnIdx) + 1;
      const updated = existing.slice(0, afterHeading) + entry + '\n' + existing.slice(afterHeading);
      fs.writeFileSync(knowledgePath, updated, 'utf8');
    }

    console.log(`[gzos] Knowledge updated: ${path.basename(knowledgePath)}`);
  } catch {
    // best-effort — never surface errors from this
  }
}
