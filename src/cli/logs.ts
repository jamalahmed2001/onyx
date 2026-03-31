import { loadConfig } from '../config/load.js';
import { discoverAllPhases } from '../vault/discover.js';
import { readRawFile } from '../vault/reader.js';
import path from 'path';
import fs from 'fs';

export async function runLogs(phaseArg?: string): Promise<void> {
  const config = loadConfig();
  const phases = discoverAllPhases(config.vaultRoot, config.projectsGlob);

  if (!phaseArg) {
    console.log('Usage: gzos logs <phase-name-or-number>');
    console.log('       gzos logs --recent   (show last active log)');
    return;
  }

  if (phaseArg === '--recent') {
    // Find most recently modified log note
    const activeLogs: Array<{ mtime: number; logPath: string; label: string }> = [];
    for (const phase of phases) {
      const phasesDir = path.dirname(phase.path);
      const bundleDir = path.dirname(phasesDir);
      const logsDir = path.join(bundleDir, 'Logs');
      const phaseNum = phase.frontmatter['phase_number'] ?? 0;
      const phaseName = String(phase.frontmatter['phase_name'] ?? '').trim();
      const safe = phaseName.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').slice(0, 140);
      const file = safe ? `L${phaseNum} - ${safe}.md` : `L${phaseNum}.md`;
      const logPath = path.join(logsDir, file);
      if (fs.existsSync(logPath)) {
        activeLogs.push({
          mtime: fs.statSync(logPath).mtimeMs,
          logPath,
          label: String(phase.frontmatter['phase_name'] ?? phaseName),
        });
      }
    }
    activeLogs.sort((a, b) => b.mtime - a.mtime);
    if (activeLogs.length === 0) {
      console.log('No logs found.');
      return;
    }
    const { logPath, label } = activeLogs[0]!;
    console.log(`\n=== ${label} ===\n`);
    console.log(readRawFile(logPath) ?? '(empty)');
    return;
  }

  // Search by name or number
  const matched = phases.find(p => {
    const name = String(p.frontmatter['phase_name'] ?? '').toLowerCase();
    const num = String(p.frontmatter['phase_number'] ?? '');
    return name.includes(phaseArg.toLowerCase()) || num === phaseArg;
  });

  if (!matched) {
    console.log(`No phase found matching "${phaseArg}"`);
    return;
  }

  const phasesDir = path.dirname(matched.path);
  const bundleDir = path.dirname(phasesDir);
  const logsDir = path.join(bundleDir, 'Logs');
  const phaseNum = matched.frontmatter['phase_number'] ?? 0;
  const phaseName = String(matched.frontmatter['phase_name'] ?? '').trim();
  const safe = phaseName.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').slice(0, 140);
  const file = safe ? `L${phaseNum} - ${safe}.md` : `L${phaseNum}.md`;
  const logPath = path.join(logsDir, file);

  if (!fs.existsSync(logPath)) {
    console.log(`No log found at: ${logPath}`);
    return;
  }

  console.log(`\n=== Log: ${String(matched.frontmatter['phase_name'] ?? '')} ===\n`);
  console.log(readRawFile(logPath));
}
