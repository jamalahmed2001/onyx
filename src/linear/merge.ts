import path from 'path';
import fs from 'fs';
import matter from 'gray-matter';
import { writeFrontmatter } from '../vault/writer.js';

/** Find an existing phase note that has a matching linear_issue_id or linear_identifier. */
export function findExistingPhaseByLinearId(phasesDir: string, linearId: string): string | null {
  if (!fs.existsSync(phasesDir)) return null;
  const files = fs.readdirSync(phasesDir).filter(f => f.endsWith('.md'));
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(phasesDir, f), 'utf-8');
      const fm = matter(raw).data as Record<string, unknown>;
      if (fm['linear_issue_id'] === linearId || fm['linear_identifier'] === linearId) {
        return path.join(phasesDir, f);
      }
    } catch { continue; }
  }
  return null;
}

/**
 * Merge Linear data into an existing phase note.
 * Vault wins on: ## Tasks, ## Acceptance Criteria, ## Blockers.
 * Linear wins on: phase_name (frontmatter), ## Overview section body.
 */
export function mergeLinearIntoPhase(
  phaseNotePath: string,
  linearTitle: string,
  linearDescription: string,
  linearId: string,
): void {
  const raw = fs.readFileSync(phaseNotePath, 'utf-8');
  const parsed = matter(raw);
  const fm = parsed.data as Record<string, unknown>;

  // Update frontmatter fields (Linear wins)
  const updatedFm = {
    ...fm,
    phase_name: linearTitle,
    linear_issue_id: linearId,
    linear_identifier: linearId, // keep legacy field in sync
  };
  writeFrontmatter(phaseNotePath, updatedFm);

  // Update ## Overview section body (Linear wins), leave other sections alone
  let body = parsed.content;
  const overviewMatch = body.match(/(## Overview\n+)([\s\S]*?)(\n## |\n---|\s*$)/);
  if (overviewMatch && linearDescription) {
    body = body.replace(overviewMatch[0], `${overviewMatch[1]}${linearDescription}\n${overviewMatch[3]}`);
    // Write updated body back while keeping frontmatter
    const newRaw = matter.stringify(body, updatedFm);
    fs.writeFileSync(phaseNotePath, newRaw, 'utf-8');
  }
}
