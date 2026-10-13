import { TECHNICAL } from '@/lib/errors';

type FeedbackKind = 'success' | 'warning' | 'error';

const STYLES: Record<FeedbackKind, string> = {
  success: 'border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/10 text-[var(--ejo-success)]',
  warning: 'border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/10 text-[var(--ejo-warning)]',
  error: 'border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/10 text-[var(--ejo-error)]',
};

/**
 * Success, warning or error banner. Form actions redirect with `?status=` or
 * `?error=`, and the page shows the outcome with this component.
 */
export function FormFeedbackBanner({ kind, message }: { kind: FeedbackKind; message: string }) {
  // Last line of defence: technical text that slipped past friendlyError is never shown.
  const text = kind === 'error' && TECHNICAL.test(message) ? 'That could not be completed. Please try again.' : message;
  return (
    <div className={`mb-6 rounded-[var(--ejo-radius-md)] border px-4 py-3 text-sm font-medium ${STYLES[kind]}`}>
      {text}
    </div>
  );
}
