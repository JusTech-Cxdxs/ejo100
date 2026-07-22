import type { ModuleStatus } from '@ejo/types';

const LABEL: Record<ModuleStatus, string> = {
  LIVE: 'Live',
  COMING_SOON: 'Coming Soon',
  DISABLED: 'Disabled',
};

const STYLE: Record<ModuleStatus, string> = {
  LIVE: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  COMING_SOON: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
  DISABLED: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
};

/** Small pill used in the portal sidebar / module registry admin UI. */
export function ModuleStatusBadge({ status }: { status: ModuleStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLE[status]}`}>
      {LABEL[status]}
    </span>
  );
}
