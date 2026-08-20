type FeedbackKind = 'success' | 'warning' | 'error';

const STYLES: Record<FeedbackKind, string> = {
  success: 'border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/10 text-[var(--ejo-success)]',
  warning: 'border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/10 text-[var(--ejo-warning)]',
  error: 'border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/10 text-[var(--ejo-error)]',
};

/**
 * Small shared success/warning/error banner, driven by a `?status=` /
 * `?error=` query param a Server Action redirects to after finishing —
 * Server Actions bound to a plain `<form action={...}>` can't hand a
 * result back to the client directly, so a redirect-with-query-param
 * carrying the outcome is the idiomatic App Router way to show one
 * without turning the whole page into a client component. Deliberately
 * one shared component rather than a bespoke banner per page — every
 * Workshop create-form should look and behave the same way.
 */
export function FormFeedbackBanner({ kind, message }: { kind: FeedbackKind; message: string }) {
  return (
    <div className={`mb-6 rounded-[var(--ejo-radius-md)] border px-4 py-3 text-sm font-medium ${STYLES[kind]}`}>
      {message}
    </div>
  );
}
