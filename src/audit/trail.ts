import path from 'path';
import fs from 'fs';
import type { AuditEvent } from '../shared/types.js';

export function getAuditPath(vaultRoot: string): string {
  return path.join(vaultRoot, '.gzos-audit', 'audit.jsonl');
}

export function appendAuditEvent(vaultRoot: string, event: AuditEvent): void {
  const auditPath = getAuditPath(vaultRoot);
  try {
    fs.mkdirSync(path.dirname(auditPath), { recursive: true });
    fs.appendFileSync(auditPath, JSON.stringify(event) + '\n', 'utf-8');
  } catch { /* non-fatal */ }
}

export function readAuditEvents(vaultRoot: string, projectId?: string): AuditEvent[] {
  const auditPath = getAuditPath(vaultRoot);
  if (!fs.existsSync(auditPath)) return [];
  try {
    const lines = fs.readFileSync(auditPath, 'utf-8').split('\n').filter(Boolean);
    const events = lines.map(l => JSON.parse(l) as AuditEvent);
    if (projectId) return events.filter(e => e.projectId === projectId);
    return events;
  } catch { return []; }
}
