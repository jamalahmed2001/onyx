// Shared status color map — single source of truth for all components.

const STATUS_COLORS: Record<string, string> = {
  active:    'var(--active)',
  blocked:   'var(--blocked)',
  ready:     'var(--ready)',
  completed: 'var(--done)',
  planning:  'var(--planning)',
  backlog:   'var(--backlog)',
};

/** Resolve a status color from a state value or a phase-* tag string. */
export function statusColor(s: string): string {
  // Direct match (e.g. 'active', 'blocked')
  if (STATUS_COLORS[s]) return STATUS_COLORS[s]!;
  // Strip phase- prefix (e.g. 'phase-active' → 'active')
  const stripped = s.startsWith('phase-') ? s.slice(6) : s;
  if (STATUS_COLORS[stripped]) return STATUS_COLORS[stripped]!;
  // Substring match for tag strings (e.g. 'phase-completed' contains 'completed')
  for (const [key, color] of Object.entries(STATUS_COLORS)) {
    if (s.includes(key)) return color;
  }
  return 'var(--text-faint)';
}
