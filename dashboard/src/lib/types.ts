// Re-export all types from shared — single source of truth.
// Dashboard components import from here (no change to their import paths).
export type {
  PhaseState as PhaseStatus,  // Dashboard historically called this PhaseStatus
  GZPhase,
  GZProject,
  RunEntry,
  VaultFileNode,
  DailyPlan,
  InboxItem,
  GraphNode,
  GraphEdge,
} from '@onyx/shared/types';
