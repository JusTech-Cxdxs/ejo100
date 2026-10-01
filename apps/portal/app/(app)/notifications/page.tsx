import Link from 'next/link';
import { getNotificationSummary, getActivityFeed, getMyBroadcasts, canBroadcast } from '@/lib/actions/notifications';
import { markReadFormAction, markAllReadFormAction } from '@/lib/actions/notification-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { SubmitButton } from '@/components/SubmitButton';
import { BROADCAST_CATEGORY, AREA_LABEL } from '@/lib/notification-rules';
import { formatDateTime } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';

const AREAS = ['WORKSHOP', 'STORE', 'WARRANTY', 'SECURITY', 'SCHEDULING', 'SYSTEM'];

const PAGE = 25;

export default async function NotificationCenter({ searchParams }: { searchParams: Promise<{ tab?: string; show?: string; area?: string; status?: string; q?: string; limit?: string }> }) {
  const { tab, show, area, status, q, limit } = await searchParams;
  const term = q?.trim() ?? '';
  const [summary, activity, allBroadcasts, broadcaster] = await Promise.all([getNotificationSummary(), getActivityFeed({ take: 400, q: term }), getMyBroadcasts(), canBroadcast()]);
  const broadcasts = term ? allBroadcasts.filter((b) => [b.title, b.message, b.number].some((x) => x.toLowerCase().includes(term.toLowerCase()))) : allBroadcasts;
  const shown = Math.max(PAGE, Number(limit) || PAGE);
  const current = ['actions', 'activity', 'broadcasts'].includes(tab ?? '') ? tab! : summary.actions.length ? 'actions' : 'activity';
  const view = show === 'all' || show === 'read' ? show : 'unread';
  const unreadOnly = view === 'unread';
  const inArea = activity.filter((a) => !area || a.area === area);
  const matching = inArea.filter((a) => (view === 'unread' ? !a.read : view === 'read' ? a.read : true));
  const feed = matching.slice(0, shown);
  const keep = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { tab: current, show: view === 'unread' ? undefined : view, area, q: term || undefined, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/notifications?${p.toString()}`;
  };
  const tabs: [string, string, number][] = [['actions', 'Action required', summary.actions.length], ['activity', 'Activity', summary.unreadActivity.length], ['broadcasts', 'Broadcasts', summary.unreadBroadcasts.length]];
  const pill = (on: boolean) => `rounded-full px-3 py-1 text-xs font-medium ${on ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`;
  const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]';
  return (
    <div className="w-full p-4 sm:p-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Notification Center</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{summary.total === 0 ? "You're all caught up." : `${pluralize(summary.total, 'item')} waiting for you.`} Sounds are {summary.muted ? 'off 🔕' : 'on 🔔'} — change it from the bell.</p>
        </div>
        {broadcaster ? <LoadingLink href="/notifications/broadcasts" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Manage broadcasts →</LoadingLink> : null}
      </div>
      {status === 'read' ? <div className="mb-4 max-w-2xl"><FormFeedbackBanner kind="success" message="Marked as read." /></div> : null}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {tabs.map(([k, l, n]) => <LoadingLink key={k} href={`/notifications?tab=${k}`} className={pill(current === k)}>{l} ({n})</LoadingLink>)}
        {current !== 'actions' ? (
          <form className="flex w-full gap-2 sm:ml-auto sm:w-auto">
            <input type="hidden" name="tab" value={current} />
            {view !== 'unread' ? <input type="hidden" name="show" value={view} /> : null}
            {area ? <input type="hidden" name="area" value={area} /> : null}
            <input name="q" defaultValue={term} placeholder={current === 'broadcasts' ? 'Search broadcasts…' : 'Search activity — number, name, area…'} className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1.5 text-sm text-[var(--ejo-text)] sm:w-72" />
          </form>
        ) : null}
      </div>

      {current === 'actions' ? (
        <div className={card}>
          {summary.actions.length === 0 ? <p className="p-6 text-sm text-[var(--ejo-text-muted)]">Nothing is waiting for your decision.</p> : (
            <ul className="divide-y divide-[var(--ejo-border)]">
              {summary.actions.map((n) => (
                <li key={n.id}>
                  <Link href={n.url} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-[var(--ejo-bg)]">
                    <span className="min-w-0"><span className="block text-sm font-medium text-[var(--ejo-text)]">⏳ {n.title}</span><span className="block text-xs text-[var(--ejo-text-muted)]">{n.detail}</span></span>
                    <span className="shrink-0 text-xs text-[var(--ejo-primary)]">Open →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-[var(--ejo-border)] px-4 py-2 text-[11px] text-[var(--ejo-text-muted)]">These stay here until the action is taken.</p>
        </div>
      ) : null}

      {current === 'activity' ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <LoadingLink href={keep({ show: undefined, limit: undefined })} className={pill(view === 'unread')}>Unread ({inArea.filter((a) => !a.read).length})</LoadingLink>
            <LoadingLink href={keep({ show: 'read', limit: undefined })} className={pill(view === 'read')}>Read ({inArea.filter((a) => a.read).length})</LoadingLink>
            <LoadingLink href={keep({ show: 'all', limit: undefined })} className={pill(view === 'all')}>All ({inArea.length})</LoadingLink>
            <span className="mx-1 text-[var(--ejo-border)]">|</span>
            <LoadingLink href={keep({ area: undefined, limit: undefined })} className={pill(!area)}>Every area</LoadingLink>
            {AREAS.filter((x) => activity.some((a) => a.area === x)).map((x) => <LoadingLink key={x} href={keep({ area: x, limit: undefined })} className={pill(area === x)}>{AREA_LABEL[x]}</LoadingLink>)}
            {summary.unreadActivity.length ? (
              <form action={markAllReadFormAction} className="sm:ml-auto"><input type="hidden" name="kind" value="activity" /><input type="hidden" name="returnTo" value="/notifications?tab=activity" /><SubmitButton label="Mark all as read" pendingLabel="…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)]" /></form>
            ) : null}
          </div>
          <div className={card}>
            {feed.length === 0 ? <p className="p-6 text-sm text-[var(--ejo-text-muted)]">{term ? `Nothing matches "${term}".` : unreadOnly ? 'No unread activity.' : view === 'read' ? 'Nothing read yet.' : 'No activity in the last 90 days.'}</p> : (
              <ul className="divide-y divide-[var(--ejo-border)]">
                {feed.map((a) => (
                  <li key={a.key} className={`flex flex-wrap items-start justify-between gap-2 px-4 py-3 ${a.read ? '' : 'bg-[var(--ejo-primary)]/5'}`}>
                    <Link href={a.url} className="min-w-0 flex-1">
                      <span className="block text-sm text-[var(--ejo-text)]">{a.read ? null : <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--ejo-primary)]" />}{a.title}</span>
                      {a.detail ? <span className="block text-xs text-[var(--ejo-text-muted)]">{a.detail}</span> : null}
                      <span className="block text-[11px] text-[var(--ejo-text-muted)]">{AREA_LABEL[a.area]} · {a.actor ?? 'System'} · {formatDateTime(a.at)}</span>
                    </Link>
                    {!a.read ? <form action={markReadFormAction}><input type="hidden" name="key" value={a.key} /><input type="hidden" name="returnTo" value={`/notifications?tab=activity${area ? `&area=${area}` : ''}`} /><SubmitButton label="Mark read" pendingLabel="…" className="text-xs text-[var(--ejo-primary)] hover:underline" /></form> : null}
                  </li>
                ))}
              </ul>
            )}
            {matching.length > feed.length ? (
              <div className="border-t border-[var(--ejo-border)] p-3 text-center">
                <LoadingLink href={keep({ limit: String(shown + PAGE) })} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">View more ({matching.length - feed.length} more)</LoadingLink>
              </div>
            ) : null}
          </div>
          <p className="mt-2 text-[11px] text-[var(--ejo-text-muted)]">Showing {pluralize(feed.length, 'item')} of {matching.length}.</p>
        </>
      ) : null}

      {current === 'broadcasts' ? (
        <>
          {summary.unreadBroadcasts.length ? (
            <form action={markAllReadFormAction} className="mb-3"><input type="hidden" name="kind" value="broadcasts" /><input type="hidden" name="returnTo" value="/notifications?tab=broadcasts" /><SubmitButton label="Mark all as read" pendingLabel="…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)]" /></form>
          ) : null}
          {broadcasts.length === 0 ? <div className={card}><p className="p-6 text-sm text-[var(--ejo-text-muted)]">No broadcasts running for you right now.</p></div> : (
            <div className="space-y-3">
              {broadcasts.map((b) => {
                const m = BROADCAST_CATEGORY[b.category]!;
                return (
                  <div key={b.key} id={b.id} className={`${card} border-l-4 ${m.bar} p-4 ${b.read ? '' : 'shadow-md'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.chip}`}>{m.icon} {m.label}</span>
                        {!b.read ? <span className="ml-2 text-[11px] font-semibold text-[var(--ejo-primary)]">New</span> : null}
                        <h2 className="mt-2 text-base font-semibold text-[var(--ejo-text)]">{b.title}</h2>
                      </div>
                      {!b.read ? <form action={markReadFormAction}><input type="hidden" name="key" value={b.key} /><input type="hidden" name="returnTo" value="/notifications?tab=broadcasts" /><SubmitButton label="Mark read" pendingLabel="…" className="text-xs text-[var(--ejo-primary)] hover:underline" /></form> : null}
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm text-[var(--ejo-text)]">{b.message}</p>
                    <p className="mt-2 text-[11px] text-[var(--ejo-text-muted)]">{b.number} · from {formatDateTime(b.startsAt)}{b.endsAt ? ` until ${formatDateTime(b.endsAt)}` : ' until stopped'}</p>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
