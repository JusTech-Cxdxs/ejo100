import type { ReactNode } from 'react';
import { LoadingLink } from '@/components/LoadingLink';
import { SectionCard } from './Cards';
import { Icon, type IconName } from './Icon';

/**
 * A settings section that is read first and changed on purpose: it shows the
 * current values, with an "Edit" button; only then do the fields open, with
 * Save and Cancel. The state lives in the address (?edit=<id>), so it works
 * without JavaScript, survives a refresh, and a failed save comes back open
 * with the message.
 */
export function EditableSection({ id, icon, title, description, editing, editHref, cancelHref, editLabel = 'Edit', view, children, tone }: {
  id: string; icon: IconName; title: ReactNode; description?: ReactNode;
  editing: boolean; editHref: string; cancelHref: string; editLabel?: string;
  /** What is set now (read-only). */ view: ReactNode;
  /** The form (shown only while editing). */ children: ReactNode;
  tone?: 'brand' | 'warning';
}) {
  return (
    <SectionCard
      id={id}
      icon={icon}
      tone={tone}
      title={title}
      description={description}
      className="scroll-mt-24"
      actions={editing
        ? <LoadingLink href={cancelHref} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--ejo-border)] px-3 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"><Icon name="close" size={13} />Cancel</LoadingLink>
        : <LoadingLink href={editHref} data-testid={`edit-${id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[var(--ejo-primary)]/10 px-3 text-xs font-semibold text-[var(--ejo-primary)] hover:bg-[var(--ejo-primary)]/15"><Icon name="settings" size={13} />{editLabel}</LoadingLink>}
    >
      {editing ? <div data-editing={id}>{children}</div> : <div data-viewing={id}>{view}</div>}
    </SectionCard>
  );
}

/** A label/value grid for the read-only view of a settings section. */
export function ViewList({ rows }: { rows: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map((r, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-medium text-[var(--ejo-text-muted)]">{r.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-[var(--ejo-text)]">{r.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
