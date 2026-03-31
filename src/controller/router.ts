import type { PhaseNode } from '../vault/reader.js';
import { stateFromNode } from '../fsm/nodeAdapter.js';

export type Operation =
  | { op: 'atomise'; phaseNode: PhaseNode }
  | { op: 'execute'; phaseNode: PhaseNode }
  | { op: 'consolidate'; phaseNode: PhaseNode }
  | { op: 'surface_blocker'; phaseNode: PhaseNode }
  | { op: 'wait'; phaseNode: PhaseNode; reason: string }
  | { op: 'skip'; reason: string };

// Pure function — no IO. Maps phase state → operation.
// Routing table from directive §10.2:
//   backlog   → atomise
//   planning  → wait (atomiser in flight)
//   ready     → execute
//   active    → execute (stale lock check is healer's job)
//   blocked   → surface_blocker
//   completed → consolidate
export function routePhase(phaseNode: PhaseNode): Operation {
  const state = stateFromNode(phaseNode);

  switch (state) {
    case 'backlog':
      return { op: 'atomise', phaseNode };

    case 'planning':
      return { op: 'wait', phaseNode, reason: 'Atomiser in flight — phase is in planning state' };

    case 'ready':
      return { op: 'execute', phaseNode };

    case 'active':
      // Stale lock check is the healer's job; we attempt to execute (re-entrant lock handles this)
      return { op: 'execute', phaseNode };

    case 'blocked':
      return { op: 'surface_blocker', phaseNode };

    case 'completed':
      return { op: 'consolidate', phaseNode };

    default: {
      const _exhaustive: never = state;
      return { op: 'skip', reason: `Unknown state: ${_exhaustive}` };
    }
  }
}
