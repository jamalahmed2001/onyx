import { execSync } from 'child_process';
import { notify } from '../notify/notify.js';
import { appendToLog } from '../vault/writer.js';
import type { ControllerConfig } from '../config/load.js';
import type { PhaseNode } from '../vault/reader.js';
import { chatCompletion } from '../llm/client.js';

export async function runPhaseReview(
  phaseNode: PhaseNode,
  repoPath: string,
  runId: string,
  config: ControllerConfig,
): Promise<void> {
  if (!config.llm?.apiKey) return;

  const projectId = String(phaseNode.frontmatter['project'] ?? '');
  const phaseLabel = String(phaseNode.frontmatter['phase_name'] ?? '');

  let diff = '';
  try {
    // Try diff against previous commit
    const statDiff = execSync(`git -C "${repoPath}" diff HEAD~1 --stat 2>/dev/null`, { encoding: 'utf-8', timeout: 10_000 });
    const fullDiff = execSync(
      `git -C "${repoPath}" diff HEAD~1 -- '*.ts' '*.tsx' '*.js' '*.py' '*.go' '*.rs' 2>/dev/null`,
      { encoding: 'utf-8', timeout: 10_000 },
    );
    diff = statDiff + '\n\n' + fullDiff.slice(0, 4000);
  } catch {
    try {
      diff = execSync(`git -C "${repoPath}" show --stat HEAD 2>/dev/null`, { encoding: 'utf-8', timeout: 10_000 });
    } catch {
      diff = '(no git diff available)';
    }
  }

  const reviewPrompt = `You are reviewing code changes for project "${projectId}", phase "${phaseLabel}".

Diff:
${diff}

Write a concise review in this EXACT format (keep under 800 chars total):

🔍 ${phaseLabel}
Project: ${projectId}

Changed: [X files - brief description]

Quality:
[use ✅ for good, ⚠️ for concerns, 🚫 for issues]

Verdict: LGTM | REVIEW NEEDED | NEEDS WORK

Be direct. No padding.`;

  try {
    const apiKey = config.llm.apiKey ?? process.env['OPENROUTER_API_KEY'] ?? '';
    if (!apiKey) return;

    const review = await chatCompletion({
      model: config.llm.model,
      apiKey,
      baseUrl: config.llm.baseUrl,
      maxTokens: 400,
      messages: [
        { role: 'user', content: reviewPrompt },
      ],
    });

    // Send via WhatsApp if configured
    if (config.notify?.whatsapp) {
      await notify({
        event: 'phase_completed',
        projectId,
        phaseLabel,
        detail: review.slice(0, 300),
        runId,
      }, config);
    }

    // Write full review to log note
    appendToLog(phaseNode.path, {
      runId,
      event: 'phase_completed',
      detail: `PHASE REVIEW:\n${review}`,
    });

    console.log(`\n[phase-review] ${review}\n`);
  } catch (err) {
    console.warn('[phase-review] Review generation failed (non-fatal):', (err as Error).message);
  }
}
