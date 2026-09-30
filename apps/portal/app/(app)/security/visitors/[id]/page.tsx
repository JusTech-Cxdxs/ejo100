import { notFound } from 'next/navigation';
import { getVisit, getSecurityRoles, getSecurityHistory } from '@/lib/actions/security';
import { visitActionFormAction } from '@/lib/actions/security-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityHistory } from '@/components/SecurityHistory';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { VISIT_STATUS_LABEL, STATUS_CHIP, VEHICLE_TYPE_LABEL, durationText, minutesBetween, visitOverdueMinutes } from '@/lib/security-rules';
import { formatDateTime } from '@/lib/utils/format-date';

const DONE: Record<string, string> = {
  registered: 'Visitor registered — Security will see them under Expected today.',
  arrived: 'Recorded at the gate — visitor pass issued. Send them to reception.',
  check_in: 'Checked in — visitor pass issued. Send them to reception.',
  receive: 'Received at reception — the host has been told.',
  extend: 'Stay extended.',
  check_out: 'Checked out.',
  cancel: 'Visit cancelled.',
};
const EXTRA = [15, 30, 60, 90, 120, 180, 240];

export default async function VisitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  const { id } = await params;
  const { status, error } = await searchParams;
  const [v, roles, history] = await Promise.all([getVisit(id), getSecurityRoles(), getSecurityHistory('Visit', id)]);
  if (!v) notFound();
  const isHost = v.host.id === roles.userId;
  const stayed = minutesBetween(v.checkedInAt, v.checkedOutAt);
  const overdue = visitOverdueMinutes(v);
  const input = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const btn = 'rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90';
  const line = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]';
  const Hidden = ({ action }: { action: string }) => (<><FormPendingOverlay /><input type="hidden" name="visitId" value={v.id} /><input type="hidden" name="action" value={action} /></>);
  const Row = ({ k, val }: { k: string; val: string | null | undefined }) => (val ? <div className="flex justify-between gap-3 py-1 text-sm"><dt className="text-[var(--ejo-text-muted)]">{k}</dt><dd className="text-right text-[var(--ejo-text)]">{val}</dd></div> : null);

  return (
    <div className="p-8">
      <LoadingLink href="/security/visitors" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Visitors</LoadingLink>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{v.visitorName}</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{v.visitNumber}{v.passNumber ? ` · Pass ${v.passNumber}` : ''}{v.isWalkIn ? ' · walk-in' : ''}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_CHIP[v.status]}`}>{VISIT_STATUS_LABEL[v.status]}</span>
      </div>
      <SecurityNav active="/security/visitors" />
      {status && DONE[status] ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={DONE[status]!} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {overdue > 0 ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={`Over the expected stay by ${durationText(overdue)} — the Chief Security Officer has been told.`} /></div> : null}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <dl className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <Row k="Company" val={v.company} />
          <Row k="Phone" val={v.phone} />
          <Row k="ID" val={[v.idType, v.idNumber].filter(Boolean).join(' ') || null} />
          <Row k="Came by" val={v.vehicleType === 'ON_FOOT' ? 'On foot' : `${VEHICLE_TYPE_LABEL[v.vehicleType] ?? 'Vehicle'} — ${v.vehiclePlate ?? ''}`} />
          <Row k="Purpose" val={v.purpose} />
          <Row k="Visiting" val={v.host.fullName} />
          <Row k="Expected" val={v.expectedAt ? formatDateTime(v.expectedAt) : null} />
          <Row k="Expected stay" val={`${durationText(v.expectedDurationMinutes)}${v.extendedMinutes ? ` (extended by ${durationText(v.extendedMinutes)})` : ''}`} />
          <Row k="Registered by" val={v.registeredBy.fullName} />
          <Row k="Checked in" val={v.checkedInAt ? `${formatDateTime(v.checkedInAt)}${v.checkedInBy ? ` by ${v.checkedInBy.fullName}` : ''}` : null} />
          <Row k="Received at reception" val={v.receivedAt ? `${formatDateTime(v.receivedAt)}${v.receivedBy ? ` by ${v.receivedBy.fullName}` : ''}` : null} />
          <Row k="Checked out" val={v.checkedOutAt ? `${formatDateTime(v.checkedOutAt)}${v.checkedOutBy ? ` by ${v.checkedOutBy.fullName}` : ''}` : null} />
          <Row k="On premises for" val={stayed !== null ? durationText(stayed) : null} />
          <Row k="Notes" val={v.notes} />
        </dl>
        <div className="space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Actions</h2>
          {v.status === 'EXPECTED' && roles.isGate ? (
            <form action={visitActionFormAction} className="space-y-2">
              <Hidden action="check_in" />
              <div className="flex flex-wrap gap-2">
                <select name="vehicleType" defaultValue={v.vehicleType} className={input}>
                  {Object.entries(VEHICLE_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <input name="vehiclePlate" defaultValue={v.vehiclePlate ?? ''} placeholder="Plate (if a vehicle)" className={`${input} min-w-0 flex-1`} />
              </div>
              <SubmitButton label="Check in and issue pass" pendingLabel="Checking in…" className={btn} />
            </form>
          ) : null}
          {v.status === 'EXPECTED' && !roles.isGate ? <p className="text-sm text-[var(--ejo-text-muted)]">Security checks the visitor in at the gate.</p> : null}
          {v.status === 'CHECKED_IN' && !v.receivedAt && roles.isFrontDesk ? (
            <form action={visitActionFormAction}><Hidden action="receive" /><SubmitButton label="Received at reception — tell the host" pendingLabel="Saving…" className={btn} /></form>
          ) : null}
          {v.status === 'CHECKED_IN' && roles.isFrontDesk ? (
            <form action={visitActionFormAction} className="flex flex-wrap gap-2">
              <Hidden action="extend" />
              <select name="extraMinutes" required defaultValue="" className={input}>
                <option value="" disabled>Extend by…</option>
                {EXTRA.map((m) => <option key={m} value={m}>{durationText(m)}</option>)}
              </select>
              <input name="reason" required placeholder="Reason (e.g. manager in a meeting)" className={`${input} min-w-0 flex-1`} />
              <SubmitButton label="Extend stay" pendingLabel="Saving…" className={line} />
            </form>
          ) : null}
          {v.status === 'CHECKED_IN' && roles.isGate ? (
            <form action={visitActionFormAction}><Hidden action="check_out" /><SubmitButton label="Check out" pendingLabel="Checking out…" className={btn} /></form>
          ) : null}
          {v.passNumber ? (
            <a href={`/print/visitor-pass/${v.id}`} target="_blank" rel="noreferrer" className={`inline-block ${line}`}>Print pass — Organisation and Visitor copies</a>
          ) : null}
          {v.status === 'EXPECTED' && (roles.isFrontDesk || isHost || v.registeredById === roles.userId) ? (
            <form action={visitActionFormAction} className="flex flex-wrap gap-2 border-t border-[var(--ejo-border)] pt-3"><Hidden action="cancel" /><input name="reason" required placeholder="Reason for cancelling" className={`${input} min-w-0 flex-1`} /><SubmitButton label="Cancel visit" pendingLabel="Saving…" className="text-sm font-medium text-[var(--ejo-error)] hover:underline" /></form>
          ) : null}
          {['CHECKED_OUT', 'CANCELLED'].includes(v.status) ? <p className="text-sm text-[var(--ejo-text-muted)]">This visit is closed.</p> : null}
        </div>
      </div>
      <SecurityHistory history={history} />
    </div>
  );
}
