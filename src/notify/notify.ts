import type { ControllerConfig } from '../config/load.js';

export type NotifyEvent =
  | 'controller_started' | 'controller_idle' | 'controller_halted'
  | 'heal_complete'
  | 'lock_acquired' | 'lock_released' | 'stale_lock_cleared'
  | 'task_started' | 'task_done' | 'task_blocked'
  | 'phase_completed' | 'phase_blocked'
  | 'atomise_started' | 'atomise_done'
  | 'replan_started' | 'replan_done'
  | 'linear_import_done' | 'linear_uplink_done';

export interface NotifyPayload {
  event: NotifyEvent;
  projectId?: string;
  phaseLabel?: string;
  detail?: string;       // one-liner
  runId?: string;
}

// Format for stdout: [GroundZeroOS] event · project · phase · detail (#runId)
export function formatStdout(payload: NotifyPayload): string {
  const parts: string[] = [`[GroundZeroOS] ${payload.event}`];
  if (payload.projectId) parts.push(payload.projectId);
  if (payload.phaseLabel) parts.push(payload.phaseLabel);
  if (payload.detail) parts.push(payload.detail);
  if (payload.runId) parts.push(`(#${payload.runId})`);
  return parts.join(' · ');
}

// Format for WhatsApp (concise, mobile-friendly):
// GroundZeroOS\nproject · phase\nevent — detail\nRun: #runId
export function formatWhatsApp(payload: NotifyPayload): string {
  const lines: string[] = ['GroundZeroOS'];

  const projectParts: string[] = [];
  if (payload.projectId) projectParts.push(payload.projectId);
  if (payload.phaseLabel) projectParts.push(payload.phaseLabel);
  if (projectParts.length > 0) lines.push(projectParts.join(' · '));

  const eventLine = payload.detail
    ? `${payload.event} — ${payload.detail}`
    : payload.event;
  lines.push(eventLine);

  if (payload.runId) lines.push(`Run: #${payload.runId}`);

  return lines.join('\n');
}

function eventEmoji(event: string): string {
  const map: Record<string, string> = {
    task_done: '✅', task_blocked: '🚫', phase_completed: '🎉', phase_blocked: '⚠️',
    lock_acquired: '🔒', lock_released: '🔓', controller_idle: '💤', controller_halted: '🛑',
    task_started: '▶️', controller_started: '🚀', replan_done: '🔄', replan_started: '🔄',
  };
  return map[event] ?? '•';
}

// Events not worth sending via WhatsApp (too noisy)
const SKIP_WHATSAPP_EVENTS = new Set<NotifyEvent>(['atomise_done', 'heal_complete', 'lock_acquired', 'lock_released']);

interface PendingBatch {
  events: NotifyPayload[];
  timer: ReturnType<typeof setTimeout>;
}

const batches = new Map<string, PendingBatch>();

async function sendWhatsAppBatch(events: NotifyPayload[], config: ControllerConfig): Promise<void> {
  if (!config.notify.whatsapp) return;
  const { apiUrl, recipient } = config.notify.whatsapp;

  const meaningful = events.filter(e => !SKIP_WHATSAPP_EVENTS.has(e.event));
  if (meaningful.length === 0) return;

  const lines = meaningful.map(e =>
    `${eventEmoji(e.event)} ${e.projectId ?? ''} · ${e.event}${e.detail ? ` — ${e.detail}` : ''}`
  );
  const message = lines.join('\n');

  try {
    const url = `${apiUrl}?phone=${encodeURIComponent(recipient)}&text=${encodeURIComponent(message)}`;
    await fetch(url, { method: 'GET' });
  } catch {
    // Fire-and-forget: swallow errors, don't block controller
  }
}

// Fire-and-forget. stdout always. WhatsApp batched per runId if configured.
export async function notify(payload: NotifyPayload, config: ControllerConfig): Promise<void> {
  // Always log to stdout immediately
  if (config.notify.stdout) {
    console.log(formatStdout(payload));
  }

  if (!config.notify.whatsapp) return;

  // Batch by runId to avoid flooding — collect events for 500ms, then send once
  const key = payload.runId ?? 'global';
  const existing = batches.get(key);
  const events = existing ? existing.events : [payload];
  if (existing) {
    existing.events.push(payload);
    clearTimeout(existing.timer);
  }
  const timer = setTimeout(async () => {
    batches.delete(key);
    await sendWhatsAppBatch(events, config);
  }, 500);
  batches.set(key, { events: existing ? existing.events : events, timer });
}
