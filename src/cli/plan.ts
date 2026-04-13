// onyx plan — daily planning command
//
// Spawns the plan-my-day skill via claude, pre-populated with onyx ready phases
// as additional context. The skill handles prayer times, time-blocking, inbox
// reads, vault write-back — the full experience.

import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { discoverReadyPhases } from '../vault/discover.js';
import type { ControllerConfig } from '../config/load.js';

const SKILL_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '..', '..', 'skills', 'plan-my-day', 'SKILL.md'
);

function extractTasks(content: string): string[] {
  return content
    .split('\n')
    .filter(l => l.match(/^- \[ \]/))
    .map(l => l.replace(/^- \[ \] /, '').trim())
    .slice(0, 3);
}

export async function runPlan(config: ControllerConfig, date?: string): Promise<void> {
  // Read the skill definition
  const skillPath = fs.existsSync(SKILL_PATH)
    ? SKILL_PATH
    : path.join(process.cwd(), 'skills', 'plan-my-day', 'SKILL.md');

  if (!fs.existsSync(skillPath)) {
    console.error('[onyx plan] SKILL.md not found at:', skillPath);
    process.exit(1);
  }

  const skillContent = fs.readFileSync(skillPath, 'utf8');

  // Build onyx phase context to inject
  const readyPhases = discoverReadyPhases(config.vaultRoot, config.projectsGlob);
  let phaseContext = '';
  if (readyPhases.length > 0) {
    const phaseLines = readyPhases.map(phase => {
      const project = String(phase.frontmatter['project'] ?? 'Unknown');
      const phaseNum = phase.frontmatter['phase_number'] ?? '?';
      const phaseName = String(phase.frontmatter['phase_name'] ?? '');
      const tasks = extractTasks(phase.content);
      const taskPreview = tasks.length > 0 ? `\n   First task: ${tasks[0]}` : '';
      return `- [${project}] P${phaseNum} — ${phaseName}${taskPreview}`;
    }).join('\n');

    phaseContext = `

---

## onyx Phase Context (auto-injected)

The following phases are currently **phase-ready** in the vault. Use these as the source of work tasks when building the plan — they replace reading Kanban files manually for these projects.

${phaseLines}

---
`;
  }

  const targetDate = date ?? new Date().toISOString().slice(0, 10);
  const prompt = `${skillContent}${phaseContext}

Run this plan for date: ${targetDate}`;

  console.log(`[onyx plan] Generating daily plan for ${targetDate}...`);
  console.log(`  ${readyPhases.length} ready phases injected as work context`);
  console.log(`  Spawning claude with plan-my-day skill...\n`);

  // Spawn claude --print with the skill prompt
  await new Promise<void>((resolve, reject) => {
    const child = spawn('claude', ['--print', prompt], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env,
    });

    child.on('error', err => {
      console.error('[onyx plan] Failed to spawn claude:', err.message);
      console.error('  Make sure claude is installed: npm install -g @anthropic-ai/claude-code');
      reject(err);
    });

    child.on('exit', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`claude exited with code ${code}`));
      }
    });
  });
}
