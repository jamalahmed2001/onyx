import { z } from 'zod';

export const PhaseTagSchema = z.enum([
  'phase-backlog', 'phase-planning', 'phase-ready',
  'phase-active', 'phase-blocked', 'phase-completed',
]);

export const PhaseFrontmatterSchema = z.object({
  phase_number: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]),
  phase_name:   z.string().min(1),
  tags:         z.union([z.array(z.string()), z.string()]),
  // optional — warn when missing but don't fail
  project_id:   z.string().optional(),
  project:      z.string().optional(),
  milestone:    z.string().optional(),
  risk:         z.enum(['low', 'medium', 'high']).optional(),
  depends_on:   z.union([z.array(z.unknown()), z.number(), z.string()]).optional(),
  linear_issue_id:   z.string().optional(),
  linear_identifier: z.string().optional(), // legacy
  locked_by:    z.string().optional(),
  locked_at:    z.string().optional(),
  lock_pid:     z.number().optional(),
  lock_hostname: z.string().optional(),
  lock_ttl_ms:  z.number().optional(),
}).passthrough(); // allow unknown fields without failure

export const OverviewFrontmatterSchema = z.object({
  project_id: z.string().min(1).optional(), // warn if missing, not error
  project:    z.string().optional(),
  repo_path:  z.string().optional(),
}).passthrough();

export interface ValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
}

/** Validate phase note frontmatter. Returns errors (hard) and warnings (soft). */
export function validatePhaseFrontmatter(fm: Record<string, unknown>): ValidationResult {
  const result = PhaseFrontmatterSchema.safeParse(fm);
  const errors: string[]   = [];
  const warnings: string[] = [];

  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`${issue.path.join('.')}: ${issue.message}`);
    }
  }

  // Soft warnings for missing but optional fields
  if (!fm['project_id'] && !fm['project']) {
    warnings.push('project_id missing — run `gzos heal` to auto-repair');
  }
  if (!fm['milestone']) warnings.push('milestone not set');
  if (!fm['risk'])      warnings.push('risk not set (low/medium/high)');

  return { valid: result.success, errors, warnings };
}

export function validateOverviewFrontmatter(fm: Record<string, unknown>): ValidationResult {
  const result = OverviewFrontmatterSchema.safeParse(fm);
  const errors: string[]   = [];
  const warnings: string[] = [];

  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`${issue.path.join('.')}: ${issue.message}`);
    }
  }
  if (!fm['project_id']) {
    warnings.push('project_id missing from Overview — add it so phases can reference this project');
  }
  return { valid: result.success, errors, warnings };
}
