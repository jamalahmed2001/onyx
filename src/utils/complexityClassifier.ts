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

// Map tier to model override.
// Config tiers take priority; falls back to sensible defaults.
export function modelForTier(
  tier: ComplexityTier,
  baseModel: string,
  configTiers?: { light?: string; standard?: string; heavy?: string },
): string {
  const defaults: Record<ComplexityTier, string> = {
    light:    'anthropic/claude-haiku-4-5-20251001',
    standard: 'anthropic/claude-sonnet-4-6',
    heavy:    'anthropic/claude-opus-4-6',
  };
  // User config overrides win
  if (configTiers?.[tier]) return configTiers[tier]!;
  // If base model already contains 'haiku' and tier is light, keep it
  if (baseModel.includes('haiku') && tier === 'light') return baseModel;
  return defaults[tier];
}
