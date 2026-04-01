import matter from 'gray-matter';
import glob from 'fast-glob';
import { discoverAllPhases } from '../vault/discover.js';
import { readPhaseNode, readRawFile } from '../vault/reader.js';
import { writeFrontmatter, resetReplanCount, writeFile } from '../vault/writer.js';
import { normalizeTag, toTag } from '../fsm/states.js';
import type { HealAction } from './index.js';

// No 'm' flag: '$' must match end-of-string only, not end-of-line.
// With 'm', '$' matches every line ending — stopping the regex at the heading
// itself and leaving link lines in the body (causing accumulating duplicates).
const NAV_BLOCK_RE = /## 🔗 Navigation[\s\S]*?(?=\n##|\n# (?!#)|$)/g;

// Deduplicate wikilinks within all nav blocks in a file.
// Uses the same pattern as NAV_BLOCK_RE — no 'm' flag, so '$' is end-of-string only.
// Returns the original string if no changes were needed.
function deduplicateNavLinks(raw: string): string {
  return raw.replace(/## 🔗 Navigation([\s\S]*?)(?=\n##|\n# (?!#)|$)/g, (match, body) => {
    const lines = body.split('\n');
    const seen = new Set<string>();
    const deduped = lines.filter((line: string) => {
      const linkMatch = /\[\[([^\]|]+)/.exec(line);
      if (!linkMatch) return true; // non-link line — always keep
      const key = linkMatch[1]!.trim();
      if (seen.has(key)) return false; // duplicate — drop
      seen.add(key);
      return true;
    });
    const newBody = deduped.join('\n');
    return newBody === body ? match : '## 🔗 Navigation' + newBody;
  });
}

const PHASE_TAGS = [
  'phase-backlog', 'phase-planning', 'phase-ready',
  'phase-active', 'phase-blocked', 'phase-completed',
] as const;

const REQUIRED_SECTIONS = ['## Tasks', '## Acceptance Criteria'];

// Fix frontmatter drift across all GZ phase notes:
// 1. status field out of sync with phase tag → rewrite status to match tag
// 2. Multiple phase-* tags → normalise to one
// 3. locked_by present but tag !== phase-active → clear lock fields
// 4. Detect (but don't auto-fix): missing required sections
export function healDrift(vaultRoot: string, projectsGlob: string): HealAction[] {
  const phases = discoverAllPhases(vaultRoot, projectsGlob);
  const actions: HealAction[] = [];

  for (const phase of phases) {
    const node = readPhaseNode(phase.path);
    if (!node.exists) continue;

    const fm = { ...node.frontmatter };
    const tags = Array.isArray(fm['tags']) ? (fm['tags'] as string[]) : [];
    const phaseTags = tags.filter(t => (PHASE_TAGS as readonly string[]).includes(t));

    let dirty = false;

    // Rule 2: Multiple phase-* tags — normalise to first one found
    if (phaseTags.length > 1) {
      const winner = phaseTags[0]!;
      const filtered = tags.filter(t => !(PHASE_TAGS as readonly string[]).includes(t));
      filtered.push(winner);
      fm['tags'] = filtered;
      dirty = true;
      actions.push({
        type: 'tag_normalized',
        phaseNotePath: phase.path,
        description: `Multiple phase tags [${phaseTags.join(', ')}] → kept ${winner}`,
        applied: false, // will be set after write
      });
    }

    // After normalisation, find the canonical tag
    const finalTags = Array.isArray(fm['tags']) ? (fm['tags'] as string[]) : tags;
    const canonicalTag = finalTags.find(t => (PHASE_TAGS as readonly string[]).includes(t));
    const canonicalState = canonicalTag ? normalizeTag(canonicalTag) : normalizeTag('backlog');

    // Rule 0 (migration): Add canonical 'state' field if missing
    if (fm['state'] === undefined || fm['state'] === null || fm['state'] === '') {
      fm['state'] = canonicalState;
      dirty = true;
      actions.push({
        type: 'frontmatter_drift_fixed',
        phaseNotePath: phase.path,
        description: `Added missing state field: "${canonicalState}" (migrated from tags/status)`,
        applied: false,
      });
    } else if (typeof fm['state'] === 'string' && normalizeTag(fm['state'] as string) !== canonicalState) {
      // state field exists but is out of sync with tags — tags win during migration
      const oldState = fm['state'];
      fm['state'] = canonicalState;
      dirty = true;
      actions.push({
        type: 'frontmatter_drift_fixed',
        phaseNotePath: phase.path,
        description: `state field "${oldState}" → "${canonicalState}" (aligned to phase tag)`,
        applied: false,
      });
    }

    // Rule 1: status field out of sync with phase tag
    const currentStatus = fm['status'];
    if (typeof currentStatus === 'string' && currentStatus !== canonicalState) {
      fm['status'] = canonicalState;
      dirty = true;
      actions.push({
        type: 'frontmatter_drift_fixed',
        phaseNotePath: phase.path,
        description: `status "${currentStatus}" → "${canonicalState}" (aligned to phase tag)`,
        applied: false,
      });
    }

    // Rule 3: locked_by present but tag !== phase-active → clear lock fields
    const lockedBy = fm['locked_by'];
    if (typeof lockedBy === 'string' && lockedBy !== '' && canonicalState !== 'active') {
      delete fm['locked_by'];
      delete fm['locked_at'];
      dirty = true;
      actions.push({
        type: 'orphaned_lock_field_cleared',
        phaseNotePath: phase.path,
        description: `locked_by "${lockedBy}" present on ${canonicalState} phase — cleared`,
        applied: false,
      });
    }

    // Apply all frontmatter fixes at once
    if (dirty) {
      try {
        writeFrontmatter(phase.path, fm);
        // Mark the last batch of actions as applied
        for (let i = actions.length - 1; i >= 0; i--) {
          const action = actions[i]!;
          if (action.phaseNotePath === phase.path && !action.applied) {
            action.applied = true;
          } else if (action.phaseNotePath !== phase.path) {
            break;
          }
        }
      } catch {
        // Leave applied:false on failure
      }
    }

    // Rule 4: Detect missing required sections (detect only, no auto-fix)
    for (const section of REQUIRED_SECTIONS) {
      if (!node.content.includes(section)) {
        actions.push({
          type: 'missing_section_detected',
          phaseNotePath: phase.path,
          description: `Missing section "${section}" in phase note`,
          applied: false, // detection only
        });
      }
    }

    // Rule 5: Duplicate ## 🔗 Navigation blocks — keep first, strip the rest
    // Also deduplicate wikilinks within any single nav block.
    const rawContent = readRawFile(phase.path);
    if (rawContent !== null) {
      const navMatches = [...rawContent.matchAll(NAV_BLOCK_RE)];
      if (navMatches.length > 1) {
        const action: HealAction = {
          type: 'duplicate_nav_removed',
          phaseNotePath: phase.path,
          description: `${navMatches.length} navigation blocks → collapsed to 1`,
          applied: false,
        };
        try {
          const parsed = matter(rawContent);
          const firstNav = navMatches[0]![0]!.trimEnd();
          // Replace all nav blocks with empty, then re-insert the first one at its original position
          let fixedBody = parsed.content;
          // Remove all nav blocks
          const allNavs = [...fixedBody.matchAll(NAV_BLOCK_RE)];
          // Replace from last to first to preserve offsets
          for (let n = allNavs.length - 1; n >= 0; n--) {
            const m = allNavs[n]!;
            if (n === 0) {
              // Keep the first nav block (deduplicated)
              fixedBody = fixedBody.slice(0, m.index!) + firstNav + fixedBody.slice(m.index! + m[0].length);
            } else {
              // Remove duplicates
              fixedBody = fixedBody.slice(0, m.index!) + fixedBody.slice(m.index! + m[0].length);
            }
          }
          fixedBody = fixedBody.replace(/\n{3,}/g, '\n\n');
          writeFile(phase.path, matter.stringify(fixedBody, parsed.data as Record<string, unknown>));
          action.applied = true;
        } catch { /* leave applied:false */ }
        actions.push(action);
      } else if (navMatches.length === 1) {
        // Rule 5b: Deduplicate links within the single nav block
        const deduped = deduplicateNavLinks(rawContent);
        if (deduped !== rawContent) {
          const action: HealAction = {
            type: 'duplicate_nav_removed',
            phaseNotePath: phase.path,
            description: 'Deduplicated wikilinks within nav block',
            applied: false,
          };
          try {
            writeFile(phase.path, deduped);
            action.applied = true;
          } catch { /* leave applied:false */ }
          actions.push(action);
        }
      }
    }

    // Rule 7: phase-ready but replan_count > 0 — reset it
    // Handles the case where human manually reset the tag after a blocked phase
    const replanCount = Number(fm['replan_count'] ?? 0);
    const tag = finalTags.find(t => (PHASE_TAGS as readonly string[]).includes(t));
    if (tag === 'phase-ready' && replanCount > 0) {
      const action: HealAction = {
        type: 'replan_count_reset',
        phaseNotePath: phase.path,
        description: `replan_count was ${replanCount}, reset to 0 (phase is phase-ready)`,
        applied: false,
      };
      try {
        resetReplanCount(phase.path);
        action.applied = true;
      } catch {
        // Leave applied:false on failure
      }
      actions.push(action);
    }
  }

  // Second pass — all .md files in vault (hubs, overviews, kanban, daily notes, etc.)
  // Skip files already handled as phase nodes above.
  const processedPaths = new Set(phases.map(p => p.path));
  const allMdFiles = glob.sync('**/*.md', {
    cwd: vaultRoot,
    absolute: true,
    ignore: ['**/.git/**', '**/node_modules/**', '**/_Archive/**'],
  });

  for (const filePath of allMdFiles) {
    if (processedPaths.has(filePath)) continue;
    const raw = readRawFile(filePath);
    if (raw === null) continue;
    const navMatches = [...raw.matchAll(NAV_BLOCK_RE)];

    if (navMatches.length > 1) {
      // Multiple nav blocks → collapse to first
      const action: HealAction = {
        type: 'duplicate_nav_removed',
        phaseNotePath: filePath,
        description: `${navMatches.length} navigation blocks → collapsed to 1`,
        applied: false,
      };
      try {
        const parsed = matter(raw);
        const firstNav = navMatches[0]![0]!.trimEnd();
        let fixedBody = parsed.content;
        const allNavs = [...fixedBody.matchAll(NAV_BLOCK_RE)];
        for (let n = allNavs.length - 1; n >= 0; n--) {
          const m = allNavs[n]!;
          if (n === 0) {
            fixedBody = fixedBody.slice(0, m.index!) + firstNav + fixedBody.slice(m.index! + m[0].length);
          } else {
            fixedBody = fixedBody.slice(0, m.index!) + fixedBody.slice(m.index! + m[0].length);
          }
        }
        fixedBody = fixedBody.replace(/\n{3,}/g, '\n\n');
        writeFile(filePath, matter.stringify(fixedBody, parsed.data as Record<string, unknown>));
        action.applied = true;
      } catch { /* leave applied:false */ }
      actions.push(action);
    } else if (navMatches.length === 1) {
      // Single nav block — deduplicate links within it
      const deduped = deduplicateNavLinks(raw);
      if (deduped !== raw) {
        const action: HealAction = {
          type: 'duplicate_nav_removed',
          phaseNotePath: filePath,
          description: 'Deduplicated wikilinks within nav block',
          applied: false,
        };
        try {
          writeFile(filePath, deduped);
          action.applied = true;
        } catch { /* leave applied:false */ }
        actions.push(action);
      }
    }
  }

  return actions;
}
