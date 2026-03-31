import type { PhaseNode } from '../shared/types.js';
import type { PhaseState } from './states.js';
import { stateFromFrontmatter } from '../shared/vault-parse.js';

// Bridge: read the current PhaseState from a PhaseNode.
// Delegates to the shared stateFromFrontmatter implementation.
export function stateFromNode(node: PhaseNode): PhaseState {
  return stateFromFrontmatter(node.frontmatter);
}
