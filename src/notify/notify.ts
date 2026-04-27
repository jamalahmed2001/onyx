import type { ControllerConfig } from '../config/load.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);


export type NotifyEvent =
  | 'controller_started' | 'controller_idle' | 'controller_halted'
  | 'heal_complete'
  | 'lock_acquired' | 'lock_released' | 'stale_lock_cleared'
  | 'task_started' | 'task_done' | 'task_blocked'
  | 'phase_completed' | 'phase_blocked'
  | 'atomise_started' | 'atomise_done'
  | 'replan_started' | 'replan_done'
  | 'consolidate_done'
  | 'linear_import_done' | 'linear_uplink_done';

export interface NotifyPayload {
  event: NotifyEvent;
  projectId?: string;
  phaseLabel?: string;
  detail?: string;       // one-liner
  runId?: string;
}

// Format for stdout: [ONYX] event · project · phase · detail (#runId)
export function formatStdout(payload: NotifyPayload): string {
  const parts: string[] = [`[ONYX] ${payload.event}`];
  if (payload.projectId) parts.push(payload.projectId);
  if (payload.phaseLabel) parts.push(payload.phaseLabel);
  if (payload.detail) parts.push(payload.detail);
  if (payload.runId) parts.push(`(#${payload.runId})`);
  return parts.join(' · ');
}

function eventEmoji(event: string): string {
  const map: Record<string, string> = {
    task_done: '✅', task_blocked: '🚫', phase_completed: '🎉', phase_blocked: '⚠️',
    lock_acquired: '🔒', lock_released: '🔓', controller_idle: '💤', controller_halted: '🛑',
    task_started: '▶️', controller_started: '🚀', replan_done: '🔄', replan_started: '🔄',
  };
  return map[event] ?? '•';
}

interface PendingBatch {
  events: NotifyPayload[];
  timer: ReturnType<typeof setTimeout>;
}

const batches = new Map<string, PendingBatch>();

async function sendOpenClawBatch(events: NotifyPayload[], config: ControllerConfig): Promise<void> {
  if (!config.notify.openclaw) return;
  if (events.length === 0) return;

  const target = config.notify.openclaw.target || process.env['OPENCLAW_NOTIFY_TARGET'] || '';
  if (!target) return;

  const lines = events.map(e =>
    `${eventEmoji(e.event)} ${e.projectId ?? ''} · ${e.event}${e.detail ? ` — ${e.detail}` : ''}`
  );
  const message = `ONYX\n${lines.join('\n')}`;

  try {
    const args = ['message', 'send', '--target', target, '--message', message];
    await execFileAsync('openclaw', args, { timeout: 10_000 });
  } catch {
    // swallow — notification failure must never stop execution
  }
}

// Fire-and-forget. stdout always. OpenClaw batched per runId if configured (Master Directive §15).
export async function notify(payload: NotifyPayload, config: ControllerConfig): Promise<void> {
  if (config.notify.stdout) {
    console.log(formatStdout(payload));
  }

  if (!config.notify.openclaw) return;

  const key = payload.runId ?? 'global';
  const existing = batches.get(key);

  if (existing) {
    existing.events.push(payload);
    clearTimeout(existing.timer);
    existing.timer = setTimeout(async () => {
      batches.delete(key);
      await sendOpenClawBatch(existing.events, config);
    }, 500);
  } else {
    const events = [payload];
    const timer = setTimeout(async () => {
      batches.delete(key);
      await sendOpenClawBatch(events, config);
    }, 500);
    batches.set(key, { events, timer });
  }
}
