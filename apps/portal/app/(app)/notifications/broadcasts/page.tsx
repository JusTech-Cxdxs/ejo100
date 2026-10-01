import { listBroadcasts, canBroadcast } from '@/lib/actions/notifications';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityTable } from '@/components/SecurityTable';
import { BROADCAST_CATEGORY, BROADCAST_STATE_LABEL } from '@/lib/notification-rules';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';

const TABS: [string, string][] = [['live', 'Live'], ['scheduled', 'Scheduled'], ['ended', 'Ended'], ['all', 'All']];
const STATE_CHIP: Record<string, string> = { LIVE: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]', SCHEDULED: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]', ENDED: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]', STOPPED: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]' };
const AUDIENCE: Record<string, string> = { ALL: 'Everyone', BRANCH: 'Branches', DEPARTMENT: 'Departments', ROLE: 'Roles' };

export default async function BroadcastsPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string; category?: string; status?: string }> }) {
  const { q, tab, category, status } = await searchParams;
  const [{ tab: current, counts, rows }, allowed] = await Promise.all([listBroadcasts(q, tab, category), canBroadcast()]);
  const keep = (k: string) => `/notifications/broadcasts?tab=${k}${q ? `&q=${encodeURIComponent(q)}` : ''}${category ? `&category=${category}` : ''}`;
  return (
    <div className="w-full p-4 sm:p-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <LoadingLink href="/notifications" className="mb-2 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Notification Center</LoadingLink>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Broadcasts</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">News, announcements, alerts, maintenance notices and greetings — on dashboards, the scrolling bar, notifications and email.</p>
        </div>
        {allowed ? <LoadingLink href="/notifications/broadcasts/new" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ New broadcast</LoadingLink> : null}
      </div>
      {status === 'deleted' ? <p className="mb-4 text-sm text-[var(--ejo-success)]">Broadcast deleted.</p> : null}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map(([k, l]) => <LoadingLink key={k} href={keep(k)} className={`rounded-full px-3 py-1 text-xs font-medium ${current === k ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>{l} ({counts[k as keyof typeof counts]})</LoadingLink>)}
        <form className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          <input type="hidden" name="tab" value={current} />
          <select name="category" defaultValue={category ?? ''} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1.5 text-sm text-[var(--ejo-text)]">
            <option value="">Every kind</option>
            {Object.entries(BROADCAST_CATEGORY).map(([k, m]) => <option key={k} value={k}>{m.icon} {m.label}</option>)}
          </select>
          <input name="q" defaultValue={q ?? ''} placeholder="Search BC number, title, message…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1.5 text-sm text-[var(--ejo-text)] sm:w-64" />
          <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-sm text-[var(--ejo-text)]">Filter</button>
        </form>
      </div>
      <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">{pluralize(rows.length, 'broadcast')}</p>
      <SecurityTable headers={['Number', 'Kind', 'Title', 'For', 'Runs', 'Email', 'State']} widths={['13%', '13%', '24%', '10%', '20%', '8%', '12%']} empty={rows.length ? null : 'No broadcasts here.'}>
        {rows.map((b) => (
          <tr key={b.id}>
            <td><LoadingLink href={`/notifications/broadcasts/${b.id}`} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">{b.broadcastNumber}</LoadingLink></td>
            <td><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BROADCAST_CATEGORY[b.category]!.chip}`}>{BROADCAST_CATEGORY[b.category]!.icon} {BROADCAST_CATEGORY[b.category]!.label}</span></td>
            <td>{b.title}<span className="block text-xs text-[var(--ejo-text-muted)]">by {b.createdBy.fullName}</span></td>
            <td className="text-xs">{AUDIENCE[b.audience]}{b.audience !== 'ALL' ? ` (${b.audienceIds.length})` : ''}</td>
            <td className="text-xs">{formatDateTimeCompact(b.startsAt)}<span className="block text-[var(--ejo-text-muted)]">{b.endsAt ? `to ${formatDateTimeCompact(b.endsAt)}` : 'until stopped'}{b.durationLabel ? ` · ${b.durationLabel}` : ''}</span></td>
            <td className="text-xs">{b.sendEmail ? (b.emailedAt ? 'Sent' : 'Pending') : '—'}</td>
            <td><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE_CHIP[b.state]}`}>{BROADCAST_STATE_LABEL[b.state]}</span></td>
          </tr>
        ))}
      </SecurityTable>
    </div>
  );
}
