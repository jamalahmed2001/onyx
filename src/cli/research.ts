// gzos research <phase>
// Pre-execution codebase research: scouts the repo and writes a Research note
// to the project bundle that gets auto-injected into agent prompts.

import { loadConfig } from '../config/load.js';
import { discoverAllPhases } from '../vault/discover.js';
import { readPhaseNode } from '../vault/reader.js';
import { writeFile, writeFrontmatter } from '../vault/writer.js';
import { chatCompletion } from '../llm/client.js';
import { resolveRepoPath } from '../repos/resolveRepoPath.js';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function runResearch(phaseArg?: string): Promise<void> {
  if (!phaseArg) {
    console.log('Usage: gzos research <phase-name-or-number>');
    console.log('       Scouts the repo and writes a Research note for agent context.');
    return;
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error('[gzos] Failed to load config:', (err as Error).message);
    process.exit(1);
  }

  const phases = discoverAllPhases(config.vaultRoot, config.projectsGlob);
  const phase = phases.find(p => {
    const name = String(p.frontmatter['phase_name'] ?? '').toLowerCase();
    const num = String(p.frontmatter['phase_number'] ?? '');
    return name.includes(phaseArg.toLowerCase()) || num === phaseArg;
  });

  if (!phase) {
    console.error(`Phase not found: ${phaseArg}`);
    console.log('Available phases:');
    for (const p of phases) {
      console.log(`  P${p.frontmatter['phase_number']} — ${p.frontmatter['phase_name']}`);
    }
    process.exit(1);
  }

  const bundleDir = path.dirname(path.dirname(phase.path));
  const projectId = String(phase.frontmatter['project'] ?? '');
  const phaseNum = phase.frontmatter['phase_number'] ?? '?';
  const phaseName = String(phase.frontmatter['phase_name'] ?? '');

  // Resolve repo path (prefer Overview.repo_path; else fuzzy match under config.reposRoot)
  const ovPath = path.join(bundleDir, `${projectId} - Overview.md`);
  let explicitRepoPath = '';
  if (fs.existsSync(ovPath)) {
    const ov = readPhaseNode(ovPath);
    explicitRepoPath = String(ov.frontmatter['repo_path'] ?? '');
  }

  const resolved = resolveRepoPath({
    projectId,
    explicitRepoPath,
    reposRoot: config.reposRoot,
  });

  const repoPath = resolved.repoPath || bundleDir;

  // If we found a repo fuzzily and Overview has no valid repo_path, write it back for determinism.
  if (resolved.source === 'fuzzy' && fs.existsSync(ovPath) && (!explicitRepoPath || !fs.existsSync(explicitRepoPath))) {
    try {
      const ov = readPhaseNode(ovPath);
      const fm = { ...ov.frontmatter, repo_path: resolved.repoPath };
      writeFrontmatter(ovPath, fm);
    } catch {
      // non-fatal
    }
  }

  console.log(`Researching phase: P${phaseNum} — ${phaseName}`);
  console.log(`Repo: ${repoPath}${resolved.source === 'fuzzy' ? ' (resolved via reposRoot fuzzy match)' : ''}`);

  // Scout the repo structure
  let repoScan = '';
  try {
    repoScan = execSync(
      `find "${repoPath}" -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.py" \\) | grep -v node_modules | grep -v dist | grep -v .git | head -80`,
      { encoding: 'utf-8', timeout: 10_000 }
    );
  } catch { repoScan = '(could not scan repo)'; }

  // Get git log
  let gitLog = '';
  try {
    gitLog = execSync(`git -C "${repoPath}" log --oneline -10`, { encoding: 'utf-8', timeout: 5_000 });
  } catch { gitLog = '(no git history)'; }

  const apiKey = config.llm.apiKey ?? process.env['OPENROUTER_API_KEY'];
  if (!apiKey) {
    console.error('[gzos] No LLM API key configured. Set OPENROUTER_API_KEY in your .env');
    process.exit(1);
  }

  const researchPrompt = `You are researching the codebase for an upcoming development phase.

Project: ${projectId}
Phase: P${phaseNum} — ${phaseName}

Phase plan:
${phase.raw.slice(0, 2000)}

Repository files:
${repoScan.slice(0, 2000)}

Recent git history:
${gitLog}

Write a research note covering:

## Don't Hand-Roll
What already exists in the codebase that this phase should USE rather than reimplement? List specific files, functions, utilities, patterns.

## Key Files to Touch
Based on the phase plan and repo structure, which files will likely need to be modified or created?

## Common Pitfalls
What are the 3-5 most likely mistakes or gotchas when implementing this phase? Be specific to this codebase.

## Recommended Approach
One paragraph on the best approach given what you've seen.

Keep the whole response under 600 words. Be specific to THIS codebase, not generic advice.`;

  console.log('Calling LLM for research...\n');

  const research = await chatCompletion({
    model: config.llm.model,
    apiKey,
    baseUrl: config.llm.baseUrl,
    maxTokens: 800,
    messages: [{ role: 'user', content: researchPrompt }],
  });

  const researchNotePath = path.join(bundleDir, `P${phaseNum} - ${phaseName} - Research.md`);
  writeFile(researchNotePath, `---
project: "${projectId}"
phase_number: ${phaseNum}
phase_name: "${phaseName}"
type: research
created: ${new Date().toISOString().slice(0, 10)}
---
## 🔗 Navigation

- [[${projectId} - Kanban|Kanban]]
- [[P${phaseNum} - ${phaseName}|Phase Note]]

# Research — P${phaseNum} ${phaseName}

${research}
`);

  console.log(`\nResearch written to: ${researchNotePath}`);
  console.log('\n' + research);
}
