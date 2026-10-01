import { notFound } from 'next/navigation';
import { getBroadcast, canBroadcast, listAudienceOptions } from '@/lib/actions/notifications';
import { getSecurityHistory } from '@/lib/actions/security';
import { broadcastActionFormAction } from '@/lib/actions/notification-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityHistory } from '@/components/SecurityHistory';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { BROADCAST_CATEGORY, BROADCAST_STATE_LABEL, DURATIONS } from '@/lib/notification-rules';
import { formatDateTime } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';

const DONE: Record<string, string> = { created: 'Broadcast published.', stop: 'Broadcast stopped — it no longer shows.', reactivate: 'Broadcast running again — everyone sees it as new.' };

export default async function BroadcastPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  const { id } = await params;
  const { status, error } = await searchParams;
  const [b, allowed, options, history] = await Promise.all([getBroadcast(id), canBroadcast(), listAudienceOptions(), getSecurityHistory('Broadcast', id)]);
  if (!b) notFound();
  const m = BROADCAST_CATEGORY[b.category]!;
  const names = b.audience === 'BRANCH' ? options.branches.filter((x) => b.audienceIds.includes(x.id)).map((x) => x.name) : b.audience === 'DEPARTMENT' ? options.departments.filter((x) => b.audienceIds.includes(x.id)).map((x) => x.name) : b.audience === 'ROLE' ? options.roles.filter((x) => b.audienceIds.includes(x.slug)).map((x) => x.name) : ['Everyone'];
  const input = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const Hidden = ({ action }: { action: string }) => (<><FormPendingOverlay /><input type="hidden" name="broadcastId" value={b.id} /><input type="hidden" name="action" value={action} /></>);
  const Row = ({ k, val }: { k: string; val: string | null | undefined }) => (val ? <div className="flex justify-between gap-3 py-1 text-sm"><dt className="text-[var(--ejo-text-muted)]">{k}</dt><dd className="text-right text-[var(--ejo-text)]">{val}</dd></div> : null);
  return (
    <div className="w-full p-4 sm:p-8">
      <LoadingLink href="/notifications/broadcasts" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Broadcasts</LoadingLink>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{b.broadcastNumber}</h1>
        <span className="rounded-full bg-[var(--ejo-bg)] px-3 py-1 text-sm font-medium text-[var(--ejo-text)]">{BROADCAST_STATE_LABEL[b.state]}</span>
      </div>
      {status && DONE[status] ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={DONE[status]!} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className={`rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] border-l-4 ${m.bar} bg-[var(--ejo-surface)] p-4 sm:p-6`}>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.chip}`}>{m.icon} {m.label}</span>
          <h2 className="mt-2 text-lg font-semibold text-[var(--ejo-text)]">{b.title}</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-[var(--ejo-text)]">{b.message}</p>
          <dl className="mt-4 border-t border-[var(--ejo-border)] pt-3">
            <Row k="For" val={names.join(', ')} />
            <Row k="Starts" val={formatDateTime(b.startsAt)} />
            <Row k="Ends" val={b.endsAt ? `${formatDateTime(b.endsAt)}${b.durationLabel ? ` (${b.durationLabel})` : ''}` : 'Until stopped'} />
            <Row k="Email" val={b.sendEmail ? (b.emailedAt ? `Sent ${formatDateTime(b.emailedAt)}` : 'Goes out when it starts') : 'Not emailed'} />
            <Row k="Read by" val={pluralize(b.readCount, 'person', 'people')} />
            <Row k="Published by" val={`${b.createdBy.fullName} · ${formatDateTime(b.createdAt)}`} />
            <Row k="Stopped" val={b.stoppedAt ? `${formatDateTime(b.stoppedAt)}${b.stoppedBy ? ` · ${b.stoppedBy.fullName}` : ''}` : null} />
          </dl>
        </div>
        {allowed ? (
          <div className="h-fit space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Actions</h2>
            {b.state === 'LIVE' || b.state === 'SCHEDULED' ? (
              <form action={broadcastActionFormAction}><Hidden action="stop" /><SubmitButton label="Stop broadcast" pendingLabel="Stopping…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)]" /></form>
            ) : (
              <form action={broadcastActionFormAction} className="space-y-2">
                <Hidden action="reactivate" />
                <p className="text-sm text-[var(--ejo-text)]">Run it again from now</p>
                <div className="flex flex-wrap gap-2">
                  <select name="duration" required defaultValue="" className={`${input} min-w-0 flex-1`}>
                    <option value="" disabled>For how long?</option>
                    {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  <select name="resendEmail" required defaultValue="" className={input}>
                    <option value="" disabled>Email again?</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <SubmitButton label="Reactivate" pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
              </form>
            )}
            <form action={broadcastActionFormAction} className="border-t border-[var(--ejo-border)] pt-3"><Hidden action="delete" /><SubmitButton label="Delete broadcast" pendingLabel="Deleting…" className="text-sm font-medium text-[var(--ejo-error)] hover:underline" /></form>
          </div>
        ) : null}
      </div>
      <SecurityHistory history={history} />
    </div>
  );
}
