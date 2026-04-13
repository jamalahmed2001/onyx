// Authoritative FSM specification.
// Types re-exported from shared; transitions + logic live here.

export type { PhaseState, PhaseTag } from '../shared/types.js';
import type { PhaseState } from '../shared/types.js';

// Re-export shared helpers so existing imports keep working
export { normalizeState as normalizeTag, stateToTag as toTag } from '../shared/vault-parse.js';

// Authoritative transition table — mirrors ONYX - Scoping (KISS).md §10.1
export const PHASE_TRANSITIONS: Record<PhaseState, PhaseState[]> = {
  backlog:   ['planning', 'ready'],
  planning:  ['ready', 'backlog'],
  ready:     ['active', 'planning'],
  active:    ['completed', 'blocked'],
  blocked:   ['active', 'planning'],
  completed: ['planning'],
};

export function canTransition(from: PhaseState, to: PhaseState): boolean {
  const allowed = PHASE_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}

export function isTerminal(state: PhaseState): boolean {
  return state === 'completed';
}
