import { notFound } from 'next/navigation';
import { getRoadTest, getSecurityRoles, getSecurityHistory, canDecideRoadTest } from '@/lib/actions/security';
import { roadTestActionFormAction, securityFollowUpFormAction } from '@/lib/actions/security-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityHistory } from '@/components/SecurityHistory';
import { PrintMenu } from '@/components/print/PrintMenu';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { ROAD_TEST_STATUS_LABEL, STATUS_CHIP, durationText, minutesBetween, roadTestOverdueMinutes } from '@/lib/security-rules';
import { formatDateTime } from '@/lib/utils/format-date';

const DONE: Record<string, string> = {
  requested: 'Road test requested — the Manager has been asked to approve it.',
  approve: 'Approved — Security has been told.',
  decline: 'Declined — the requester has been told.',
  cancel: 'Road test cancelled.',
  gate_out: 'Out on road test — time and odometer recorded.',
  gate_in: 'Back — time and odometer recorded; the vehicle\u2019s odometer is updated.',
  extend: 'Road test extended.',
  follow_up: 'Follow-up saved.',
};

export default async function RoadTestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  const { id } = await params;
  const { status, error } = await searchParams;
  const [r, roles, history, canDecide] = await Promise.all([getRoadTest(id), getSecurityRoles(), getSecurityHistory('RoadTestPermit', id), canDecideRoadTest(id)]);
  if (!r) notFound();
  const away = minutesBetween(r.gateOutAt, r.gateInAt);
  const km = r.startOdometer !== null && r.endOdometer !== null ? r.endOdometer - r.startOdometer : null;
  const over = roadTestOverdueMinutes(r);
  const rec = r.jobCard ? { number: r.jobCard.jobNumber, href: `/workshop/job-cards/${r.jobCard.id}`, customer: r.jobCard.customer.fullName } : r.vehicleService ? { number: r.vehicleService.serviceNumber, href: `/workshop/vehicle-service/${r.vehicleService.id}`, customer: r.vehicleService.customer.fullName } : null;
  const input = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const btn = 'rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90';
  const line = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]';
  const Hidden = ({ action }: { action: string }) => (<><FormPendingOverlay /><input type="hidden" name="permitId" value={r.id} /><input type="hidden" name="action" value={action} /></>);
  const Row = ({ k, val }: { k: string; val: string | null | undefined }) => (val ? <div className="flex justify-between gap-3 py-1 text-sm"><dt className="text-[var(--ejo-text-muted)]">{k}</dt><dd className="text-right text-[var(--ejo-text)]">{val}</dd></div> : null);
  const kmText = (n: number | null) => (n === null ? null : `${n.toLocaleString('en-NG')} km`);
  return (
    <div className="p-4 sm:p-8">
      <LoadingLink href="/security/road-tests" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Road tests</LoadingLink>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Road test {r.permitNumber}</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{[r.vehicle.make, r.vehicle.model].filter(Boolean).join(' ')}{r.vehicle.plateNumber ? ` — ${r.vehicle.plateNumber}` : ''} · requested by {r.requestedBy.fullName} on {formatDateTime(r.createdAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {['APPROVED', 'OUT', 'RETURNED'].includes(r.status) ? <PrintMenu orgHref={`/print/road-test/${r.id}`} clientHref={`/print/road-test/${r.id}?variant=client`} clientLabel="Driver Copy" align="right" /> : null}
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_CHIP[r.status] ?? ''}`}>{ROAD_TEST_STATUS_LABEL[r.status]}</span>
        </div>
      </div>
      <SecurityNav active="/security/road-tests" />
      {status && DONE[status] ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={DONE[status]!} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {over > 0 ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={`Past its expected return by ${durationText(over)}.`} /></div> : null}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <dl className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <Row k="Record" val={rec?.number} />
          <Row k="Customer" val={rec?.customer} />
          <Row k="Plate / VIN" val={[r.vehicle.plateNumber, r.vehicle.chassisNumber].filter(Boolean).join(' · ') || null} />
          <Row k="Driver" val={`${r.driver.fullName}${r.driver.phone ? ` · ${r.driver.phone}` : ''}`} />
          <Row k="Checking" val={r.purpose} />
          <Row k="Route" val={r.route} />
          <Row k="Expected duration" val={durationText(r.expectedDurationMinutes)} />
          <Row k="Approved by (Manager)" val={r.managerApprovedBy && r.managerApprovedAt ? `${r.managerApprovedBy.fullName} · ${formatDateTime(r.managerApprovedAt)}` : null} />
          <Row k="Declined" val={r.declinedBy && r.declinedAt ? `${r.declinedBy.fullName} · ${formatDateTime(r.declinedAt)} — ${r.declineReason ?? ''}` : null} />
          <Row k="Cancelled because" val={r.cancelReason} />
          <Row k="Time out" val={r.gateOutAt ? `${formatDateTime(r.gateOutAt)}${r.gateOutBy ? ` · ${r.gateOutBy.fullName}` : ''}` : null} />
          <Row k="Odometer out" val={kmText(r.startOdometer)} />
          <Row k="Time in" val={r.gateInAt ? `${formatDateTime(r.gateInAt)}${r.gateInBy ? ` · ${r.gateInBy.fullName}` : ''}` : null} />
          <Row k="Odometer in" val={kmText(r.endOdometer)} />
          <Row k="Distance driven" val={kmText(km)} />
          <Row k="Time out of the compound" val={away !== null ? durationText(away) : null} />
          <Row k="Return notes" val={r.returnNotes} />
          <p className="mt-2 flex flex-wrap gap-4 text-xs">
            {rec ? <LoadingLink href={rec.href} className="text-[var(--ejo-primary)] hover:underline">Open {rec.number} →</LoadingLink> : null}
            <LoadingLink href={`/workshop/vehicles/${r.vehicle.id}/edit`} className="text-[var(--ejo-primary)] hover:underline">Open the vehicle →</LoadingLink>
          </p>
        </dl>
        <div className="h-fit space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Actions</h2>
          {canDecide ? (
            <>
              <form action={roadTestActionFormAction}><Hidden action="approve" /><SubmitButton label="Approve road test" pendingLabel="Saving…" className={btn} /></form>
              <form action={roadTestActionFormAction} className="flex flex-wrap gap-2"><Hidden action="decline" /><input name="reason" required placeholder="Reason for declining" className={`${input} min-w-0 flex-1`} /><SubmitButton label="Decline" pendingLabel="Saving…" className={line} /></form>
            </>
          ) : r.status === 'PENDING_MANAGER' ? <p className="text-sm text-[var(--ejo-text-muted)]">Waiting for the Manager to approve.</p> : null}
          {r.status === 'APPROVED' && roles.isGate ? (
            <form action={roadTestActionFormAction} className="flex flex-wrap gap-2"><Hidden action="gate_out" /><input name="odometer" type="number" min={0} step={1} required placeholder="Odometer now (km)" defaultValue={r.vehicle.mileage ?? ''} className={`${input} min-w-0 flex-1`} /><SubmitButton label="Record time out" pendingLabel="Saving…" className={btn} /></form>
          ) : null}
          {r.status === 'OUT' && roles.isGate ? (
            <>
              <form action={roadTestActionFormAction} className="space-y-2"><Hidden action="gate_in" /><div className="flex flex-wrap gap-2"><input name="odometer" type="number" min={r.startOdometer ?? 0} step={1} required placeholder="Odometer now (km)" className={`${input} min-w-0 flex-1`} /><input name="notes" placeholder="Notes (optional)" className={`${input} min-w-0 flex-1`} /></div><SubmitButton label="Record time in" pendingLabel="Saving…" className={btn} /></form>
              <form action={roadTestActionFormAction} className="flex flex-wrap gap-2 border-t border-[var(--ejo-border)] pt-3"><Hidden action="extend" />
                <select name="extraMinutes" required defaultValue="" className={input}><option value="" disabled>Extend by…</option>{[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{durationText(m)}</option>)}</select>
                <input name="reason" required placeholder="Reason" className={`${input} min-w-0 flex-1`} /><SubmitButton label="Extend" pendingLabel="Saving…" className={line} />
              </form>
            </>
          ) : null}
          {roles.isFrontDesk && ['APPROVED', 'OUT'].includes(r.status) ? (
            <form action={securityFollowUpFormAction} className="flex flex-wrap gap-2 border-t border-[var(--ejo-border)] pt-3"><FormPendingOverlay /><input type="hidden" name="entityType" value="RoadTestPermit" /><input type="hidden" name="entityId" value={r.id} /><input name="note" required placeholder="Follow-up note" className={`${input} min-w-0 flex-1`} /><SubmitButton label="Add note" pendingLabel="Saving…" className={line} /></form>
          ) : null}
          {['PENDING_MANAGER', 'APPROVED'].includes(r.status) && (r.requestedBy.id === roles.userId || roles.isManager || roles.isMaster) ? (
            <form action={roadTestActionFormAction} className="flex flex-wrap gap-2 border-t border-[var(--ejo-border)] pt-3"><Hidden action="cancel" /><input name="reason" required placeholder="Reason for cancelling" className={`${input} min-w-0 flex-1`} /><SubmitButton label="Cancel road test" pendingLabel="Saving…" className="text-sm font-medium text-[var(--ejo-error)] hover:underline" /></form>
          ) : null}
          {['RETURNED', 'DECLINED', 'CANCELLED'].includes(r.status) ? <p className="text-sm text-[var(--ejo-text-muted)]">This road test is closed.</p> : null}
        </div>
      </div>
      <SecurityHistory history={history} />
    </div>
  );
}
