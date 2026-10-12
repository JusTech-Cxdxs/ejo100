/** Tone → classes for icon tiles and chips. Green (brand) is the default;
 * the others are for meaning only (warning, problem, information, closed). */
export type Tone = 'brand' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

export const TONE_TILE: Record<Tone, string> = {
  brand: 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)] ring-[var(--ejo-primary)]/15',
  success: 'bg-[var(--ejo-success)]/10 text-[var(--ejo-success)] ring-[var(--ejo-success)]/15',
  warning: 'bg-[var(--ejo-warning)]/12 text-[var(--ejo-warning)] ring-[var(--ejo-warning)]/20',
  error: 'bg-[var(--ejo-error)]/10 text-[var(--ejo-error)] ring-[var(--ejo-error)]/15',
  info: 'bg-[var(--ejo-info)]/10 text-[var(--ejo-info)] ring-[var(--ejo-info)]/15',
  neutral: 'bg-[var(--ejo-text-muted)]/10 text-[var(--ejo-text-muted)] ring-[var(--ejo-text-muted)]/15',
};

export const TONE_TEXT: Record<Tone, string> = {
  brand: 'text-[var(--ejo-primary)]', success: 'text-[var(--ejo-success)]', warning: 'text-[var(--ejo-warning)]',
  error: 'text-[var(--ejo-error)]', info: 'text-[var(--ejo-info)]', neutral: 'text-[var(--ejo-text-muted)]',
};
