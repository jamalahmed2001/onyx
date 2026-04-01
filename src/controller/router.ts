import type { PhaseNode } from '../vault/reader.js';
import { stateFromFrontmatter } from '../shared/vault-parse.js';

// ── Operation the controller loop should perform for this phase ───────────────
export type Operation =
  | { op: 'atomise';        phaseNode: PhaseNode }
  | { op: 'execute';        phaseNode: PhaseNode }
  | { op: 'surface_blocker'; phaseNode: PhaseNode }
  | { op: 'wait';           phaseNode: PhaseNode; reason: string }
  | { op: 'skip';           reason: string };

// Pure function — no IO. Reads state from frontmatter and maps it to a single
// operation. Knowledge extraction is NOT a routing concern: it happens inline
// inside the execute case immediately after the phase completes.
//
//   backlog   → atomise          (generate task plan)
//   planning  → wait             (atomiser is in-flight, do nothing)
//   ready     → execute          (run tasks with agent)
//   active    → execute          (stale-lock recovery: healer clears the lock;
//                                 the next iteration re-acquires it cleanly)
//   blocked   → surface_blocker  (write human requirement, notify)
//   completed → skip             (terminal — already consolidated inline)
export function routePhase(phaseNode: PhaseNode): Operation {
  const state = stateFromFrontmatter(phaseNode.frontmatter);

  switch (state) {
    case 'backlog':   return { op: 'atomise',         phaseNode };
    case 'planning':  return { op: 'wait',             phaseNode, reason: 'Atomiser in flight' };
    case 'ready':     return { op: 'execute',          phaseNode };
    case 'active':    return { op: 'execute',          phaseNode };
    case 'blocked':   return { op: 'surface_blocker',  phaseNode };
    case 'completed': return { op: 'skip',             reason: 'Already completed' };
    default: {
      const _exhaustive: never = state;
      return { op: 'skip', reason: `Unknown state: ${_exhaustive}` };
    }
  }
}
