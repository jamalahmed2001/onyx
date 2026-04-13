// onyx capture <text>
// Fire-and-forget thought capture — appends to Obsidian Inbox for triage.

import { loadConfig } from '../config/load.js';
import path from 'path';
import fs from 'fs';

export async function runCapture(text?: string): Promise<void> {
  if (!text) {
    console.log('Usage: onyx capture "your thought or task"');
    console.log('       Saves to Obsidian Inbox for triage in next plan.');
    return;
  }

  const config = loadConfig();
  const inboxPath = path.join(config.vaultRoot, '00 - Dashboard', 'Inbox.md');

  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const entry = `- [ ] ${text} — _captured ${timestamp}_\n`;

  if (fs.existsSync(inboxPath)) {
    fs.appendFileSync(inboxPath, entry, 'utf-8');
  } else {
    fs.mkdirSync(path.dirname(inboxPath), { recursive: true });
    fs.writeFileSync(inboxPath, `# Inbox\n\n${entry}`, 'utf-8');
  }

  console.log(`Captured: "${text}"`);
  console.log(`→ ${inboxPath}`);
}
