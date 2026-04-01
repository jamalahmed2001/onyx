export type ComplexityTier = 'light' | 'standard' | 'heavy';

const HEAVY_SIGNAL_WORDS = [
  'research', 'investigate', 'refactor', 'migrate', 'integrate',
  'architect', 'redesign', 'security', 'performance', 'concurrent',
  'parallel', 'distributed', 'backward compat', 'schema change',
  'breaking change', 'rewrite',
];

const LIGHT_SIGNAL_WORDS = [
  'rename', 'move file', 'update comment', 'fix typo', 'add log',
  'bump version', 'update readme', 'add export',
];

export function classifyComplexity(
  taskText: string,
  phaseFrontmatter: Record<string, unknown>,
): ComplexityTier {
  const text = taskText.toLowerCase();
  const risk = String(phaseFrontmatter['risk'] ?? 'medium');
  const phaseType = String(phaseFrontmatter['phase_type'] ?? 'slice');

  // Count imperative verbs as steps
  const stepCount = (text.match(/\b(implement|create|add|write|build|configure|set up|integrate|refactor|migrate|update|fix|debug|test|verify|deploy|connect|wire)\b/g) ?? []).length;

  // Count file references
  const fileCount = (text.match(/`[^`]+\.(ts|tsx|js|py|go|rs|sql|json|md)`/g) ?? []).length;

  const hasHeavySignal = HEAVY_SIGNAL_WORDS.some(w => text.includes(w));
  const hasLightSignal = LIGHT_SIGNAL_WORDS.some(w => text.includes(w));

  // Hard overrides
  if (risk === 'high' || (phaseType === 'slice' && stepCount > 5)) return 'heavy';
  if (hasHeavySignal) return 'heavy';
  if (hasLightSignal && risk === 'low') return 'light';
  if (stepCount <= 1 && fileCount <= 1 && taskText.length < 100) return 'light';
  if (stepCount > 3 || fileCount > 3 || taskText.length > 300) return 'standard';
  return 'standard';
}

// Map complexity tier to model. Config tiers are always set (defaults in config/load.ts).
export function modelForTier(
  tier: ComplexityTier,
  configTiers: { light: string; standard: string; heavy: string },
): string {
  return configTiers[tier];
}
