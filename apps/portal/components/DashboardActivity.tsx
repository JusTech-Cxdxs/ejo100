'use client';

import Link from 'next/link';
import { useNotifications } from '@/components/NotificationProvider';
import { AREA_LABEL } from '@/lib/notification-rules';
import { Icon } from '@/components/ui/Icon';
import { AREA_ICON } from '@/components/ui/notify-icons';
import { formatRelative } from '@/lib/utils/format-date';

const ago = (date: Date) => formatRelative(date, new Date(), { short: true });

/**
 * The dashboard's "what's new" — read from the same live source as the bell
 * (no extra request), so it updates by itself while the page is open.
 */
export function DashboardActivity() {
  const { summary, state } = useNotifications();
  const items = summary.unreadActivity.slice(0, 7);
  if (state === 'loading') {
    return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="flex gap-3"><span className="h-8 w-8 animate-pulse rounded-lg bg-[var(--ejo-border)]/70" /><span className="h-3 flex-1 animate-pulse self-center rounded bg-[var(--ejo-border)]/70" /></div>)}</div>;
  }
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] px-3 py-4 text-sm text-[var(--ejo-text-muted)]">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name="check-circle" size={16} /></span>
        Nothing new since you last looked.
      </div>
    );
  }
  return (
    <ol className="relative space-y-1 before:absolute before:bottom-3 before:left-4 before:top-3 before:w-px before:bg-[var(--ejo-border)]">
      {items.map((a) => (
        <li key={a.key}>
          <Link href={a.url} className="group relative flex gap-3 rounded-[var(--ejo-radius-md)] py-1.5 pr-2 transition-colors hover:bg-[var(--ejo-bg)]">
            <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--ejo-surface)] text-[var(--ejo-primary)] ring-1 ring-[var(--ejo-border)] transition-colors group-hover:ring-[var(--ejo-primary)]/40">
              <Icon name={AREA_ICON[a.area] ?? 'activity'} size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-1 block text-sm text-[var(--ejo-text)]">{a.title}</span>
              <span className="block truncate text-xs text-[var(--ejo-text-muted)]">{AREA_LABEL[a.area]} · {a.actor ?? 'System'} · {ago(a.at)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
