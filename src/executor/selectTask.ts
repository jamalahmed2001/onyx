// Find the next unchecked task in phase note content.
// Priority order:
//   1) Agent-writable phase plan block (<!-- AGENT_WRITABLE_START:phase-plan -->)
//   2) ## Tasks section
//   3) Fallback: any unchecked checkbox outside skip sections
//
// Skips checkboxes in ## Acceptance Criteria, ## Blockers, ## Log sections.
// Returns null when all tasks are done.

// Strip leading emoji / unicode symbols from a heading string so
// "📂 Tasks" and "✅ Acceptance Criteria" compare equal to "tasks" / "acceptance criteria"
function normaliseHeading(raw: string): string {
  return raw
    // Remove emoji and other non-ASCII symbols at start
    .replace(/^[\p{Emoji}\p{So}\p{Sk}\s]+/u, '')
    .trim()
    .toLowerCase();
}

// Collect a task from the AGENT_WRITABLE block.
// Handles both single-line "- [ ] do thing" and multi-line:
//   - [ ]
//     Files: ...
//     Steps: ...
function collectBlockTask(lines: string[], startIdx: number): string {
  const first = lines[startIdx]!.trim();
  const parts: string[] = [first];
  // Collect indented continuation lines immediately following
  for (let i = startIdx + 1; i < lines.length; i++) {
    const l = lines[i]!;
    // Stop at blank lines, new checkboxes, or headings
    if (!l.trim()) break;
    if (/^\s*[-*]\s*\[/.test(l)) break;
    if (/^#+\s/.test(l)) break;
    if (/^<!--/.test(l)) break;
    parts.push(l.trim());
  }
  return parts.join('\n');
}

export function selectNextTask(phaseContent: string): string | null {
  const lines = phaseContent.split('\n');

  // 0) Prefer the explicit agent-writable phase plan block if present.
  // This is where atomised [T*] implementation tasks live.
  const PLAN_START = '<!-- AGENT_WRITABLE_START:phase-plan -->';
  const PLAN_END   = '<!-- AGENT_WRITABLE_END:phase-plan -->';
  let inPlan = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.includes(PLAN_START)) { inPlan = true; continue; }
    if (line.includes(PLAN_END))   { inPlan = false; continue; }
    if (!inPlan) continue;

    // Match: "- [ ] some text" (single-line) OR bare "- [ ]" (multi-line block)
    if (/^\s*[-*]\s*\[\s\]/.test(line)) {
      const task = collectBlockTask(lines, i);
      // Only return if there's meaningful content beyond just the checkbox
      const contentLines = task.split('\n').filter(l => !/^\s*-\s*\[\s*\]\s*$/.test(l));
      if (task.replace(/^\s*[-*]\s*\[\s\]\s*/, '').trim() || contentLines.length > 0) {
        return task;
      }
    }
  }

  // Section tracking
  const SKIP_SECTIONS = new Set([
    'acceptance criteria',
    'blockers',
    'log',
    'notes',
    'learnings',
  ]);

  let inTasksSection = false;
  let inSkipSection  = false;
  let foundTasksSection = false;

  // First pass: look for unchecked tasks in ## Tasks section only
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      const heading = normaliseHeading(h2Match[1]!);
      if (heading === 'tasks') {
        inTasksSection = true;
        inSkipSection  = false;
        foundTasksSection = true;
      } else if (SKIP_SECTIONS.has(heading)) {
        inTasksSection = false;
        inSkipSection  = true;
      } else {
        inTasksSection = false;
        inSkipSection = false;
      }
      continue;
    }
    // h3/h4 sub-headings inside ## Tasks do NOT exit the section
    if (/^#{3,4}\s+/.test(line)) continue;

    if (inTasksSection && !inSkipSection) {
      if (/^\s*[-*]\s*\[\s\]/.test(line)) {
        const task = collectBlockTask(lines, i);
        return task;
      }
    }
  }

  // If no ## Tasks section found, fall back to scanning all unchecked tasks
  // outside known skip sections
  if (!foundTasksSection) {
    inSkipSection = false;
    for (const line of lines) {
      const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
      if (headingMatch) {
        inSkipSection = SKIP_SECTIONS.has(normaliseHeading(headingMatch[1]!));
        continue;
      }
      if (!inSkipSection) {
        const uncheckedMatch = line.match(/^\s*[-*]\s*\[\s\]\s*(.+)$/);
        if (uncheckedMatch) return line.trim();
      }
    }
  }

  return null;
}

// Returns true when all checkboxes in ## Acceptance Criteria or ## Verification are ticked.
// Returns true if neither section is present.
// For ## Verification, ignores the ### Human sub-section (non-blocking).
export function acceptanceMet(phaseContent: string): boolean {
  const lines = phaseContent.split('\n');
  let inAC           = false;
  let inVerification = false;
  let inHumanSubsection = false;

  for (const line of lines) {
    const h4 = line.match(/^####\s+(.+)$/);
    const h3 = line.match(/^###\s+(.+)$/);
    const h2 = line.match(/^##\s+(.+)$/);
    const h1 = line.match(/^#\s+(.+)$/);

    if (h2) {
      const text = normaliseHeading(h2[1]!);
      inAC           = text === 'acceptance criteria';
      inVerification = text === 'verification';
      inHumanSubsection = false;
      continue;
    }
    if (inVerification && h3) {
      inHumanSubsection = normaliseHeading(h3[1]!) === 'human';
      continue;
    }
    if (h3 || h4 || h1) continue;

    if ((inAC || (inVerification && !inHumanSubsection)) && /^\s*-\s*\[\s\]/.test(line)) {
      return false;
    }
  }
  return true;
}
