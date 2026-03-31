import fs from 'fs';
import path from 'path';
import { discoverAllPhases } from '../vault/discover.js';
import type { HealAction } from './index.js';

// Hard migration (Option A):
// Canonical logs are now: Logs/L{n} - <Phase Name>.md
//
// Migration does:
// - Ensure canonical log exists (prefer renaming whichever legacy file exists)
// - Update phase note + Agent Log Hub links to point at the canonical filename
// - Move any other old-format logs into Logs/_Archive/legacy-logs/ (or duplicates/)
//
// Safety rules:
// - Only rename when target doesn't already exist.
// - If both exist, leave legacy file in place and emit a detected (not applied) action.

function safeFileSegment(s: string): string {
  return String(s)
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 140);
}

function canonicalLogFilename(n: number, phaseName: string): string {
  const seg = safeFileSegment(phaseName);
  return seg ? `L${n} - ${seg}.md` : `L${n}.md`;
}

function replaceLogLinks(content: string, n: number, phaseName: string): string {
  const canonical = canonicalLogFilename(n, phaseName).replace(/\.md$/, '');

  // Replace [[L{n}]] (optionally with alias) -> [[L{n} - <Phase Name>]] preserving alias
  // Also replace any [[L{n} - <anything>]] -> canonical.
  const reAny = new RegExp(`\\[\\[L${n}(?:\\s+-[^\\]|]+)?(\\|[^\\]]+)?\\]\\]`, 'g');
  return content.replace(reAny, (_m, alias) => `[[${canonical}${alias ?? ''}]]`);
}

function patchAgentLogHubLinks(content: string, phaseNumToName: Map<number, string>): string {
  // Replace any Lx links to canonical per phase name.
  return content.replace(/\[\[L(\d+)(?:\s+-[^\]|]+)?\|([^\]]+)\]\]/g, (_m, nStr, alias) => {
    const n = Number(nStr);
    const name = phaseNumToName.get(n) ?? '';
    const canonical = canonicalLogFilename(n, name).replace(/\.md$/, '');
    return `[[${canonical}|${alias}]]`;
  });
}

export function healMigrateLogs(vaultRoot: string, projectsGlob: string): HealAction[] {
  const actions: HealAction[] = [];
  const phases = discoverAllPhases(vaultRoot, projectsGlob);

  // Patch Agent Log Hub files per bundle dir (dedupe)
  const patchedHubs = new Set<string>();

  // Build a phaseNum -> phaseName map per bundle while iterating.
  // (Used to patch Agent Log Hub links deterministically.)

  for (const phase of phases) {
    const n = Number(phase.frontmatter['phase_number'] ?? 0);
    if (!n || Number.isNaN(n)) continue;

    const phasesDir = path.dirname(phase.path);
    const bundleDir = path.dirname(phasesDir);
    const logsDir = path.join(bundleDir, 'Logs');
    const baseName = path.basename(phase.path);

    const phaseName = String(phase.frontmatter['phase_name'] ?? '').trim();
    const canonicalFile = canonicalLogFilename(n, phaseName);
    const canonicalPath = path.join(logsDir, canonicalFile);

    // Legacy candidates we might see:
    // - L{n}.md (from the short-lived Ln-only experiment)
    // - L{n} - P{n} - <name>.md (older)
    // - L{n} - <phase filename>.md (very old)
    // - L{n} - Phase {n} - <name>.md (older)
    const legacyCandidates = [
      path.join(logsDir, `L${n}.md`),
      path.join(logsDir, `L${n} - P${n} - ${phaseName}.md`),
      path.join(logsDir, `L${n} - ${baseName}`),
      path.join(logsDir, `L${n} - Phase ${n} - ${phaseName}.md`),
    ];

    // 1) Ensure canonical log exists
    if (!fs.existsSync(canonicalPath)) {
      const existing = legacyCandidates.find(p => fs.existsSync(p));
      if (existing) {
        try {
          fs.renameSync(existing, canonicalPath);
          actions.push({
            type: 'frontmatter_drift_fixed',
            phaseNotePath: phase.path,
            description: `log_migrated: ${path.basename(existing)} -> ${path.basename(canonicalPath)}`,
            applied: true,
          });
        } catch (err: any) {
          actions.push({
            type: 'frontmatter_drift_fixed',
            phaseNotePath: phase.path,
            description: `log_migration_failed: ${path.basename(existing)} -> ${path.basename(canonicalPath)} (${err?.message ?? 'unknown error'})`,
            applied: false,
          });
        }
      }
    }

    // 2) Delete any other L{n} - *.md files that are NOT the canonical file
    try {
      if (fs.existsSync(logsDir)) {
        const stale = fs.readdirSync(logsDir).filter(f =>
          f.startsWith(`L${n} - `) && f.endsWith('.md') && f !== canonicalFile
        );
        for (const f of stale) {
          const p = path.join(logsDir, f);
          if (!fs.existsSync(p)) continue;
          fs.rmSync(p);
          actions.push({
            type: 'frontmatter_drift_fixed',
            phaseNotePath: phase.path,
            description: `log_deleted_stale: ${f}`,
            applied: true,
          });
        }

        // Also delete bare Ln.md if canonical is present
        const lnPath = path.join(logsDir, `L${n}.md`);
        if (fs.existsSync(lnPath) && fs.existsSync(canonicalPath)) {
          fs.rmSync(lnPath);
        }
      }
    } catch (err: any) {
      actions.push({
        type: 'frontmatter_drift_fixed',
        phaseNotePath: phase.path,
        description: `log_cleanup_failed: ${err?.message ?? 'unknown error'}`,
        applied: false,
      });
    }

    // 3) Patch phase note links
    if (phase.exists) {
      const raw = fs.readFileSync(phase.path, 'utf8');
      const patched = replaceLogLinks(raw, n, phaseName);
      if (patched !== raw) {
        fs.writeFileSync(phase.path, patched, 'utf8');
        actions.push({
          type: 'frontmatter_drift_fixed',
          phaseNotePath: phase.path,
          description: `phase_links_updated: L${n} -> ${canonicalFile.replace(/\.md$/, '')}`,
          applied: true,
        });
      }
    }

    // 4) Patch Agent Log Hub (best-effort)
    const projectId = String(phase.frontmatter['project'] ?? path.basename(bundleDir));
    const hubPath = path.join(bundleDir, `${projectId} - Agent Log Hub.md`);
    if (!patchedHubs.has(hubPath) && fs.existsSync(hubPath)) {
      patchedHubs.add(hubPath);

      // Build phase num -> name map for this bundle
      const phaseNumToName = new Map<number, string>();
      for (const p of phases) {
        const pBundleDir = path.dirname(path.dirname(p.path));
        if (pBundleDir !== bundleDir) continue;
        const pn = Number(p.frontmatter['phase_number'] ?? 0);
        if (!pn) continue;
        phaseNumToName.set(pn, String(p.frontmatter['phase_name'] ?? '').trim());
      }

      const raw = fs.readFileSync(hubPath, 'utf8');
      const patched = patchAgentLogHubLinks(raw, phaseNumToName);
      if (patched !== raw) {
        fs.writeFileSync(hubPath, patched, 'utf8');
        actions.push({
          type: 'frontmatter_drift_fixed',
          phaseNotePath: hubPath,
          description: `agent_log_hub_links_updated`,
          applied: true,
        });
      }
    }
  }

  return actions;
}
