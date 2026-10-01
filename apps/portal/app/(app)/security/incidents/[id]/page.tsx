import { notFound } from 'next/navigation';
import { getIncident, getSecurityRoles, getSecurityHistory, listGateStaffOptions } from '@/lib/actions/security';
import { incidentActionFormAction, securityFollowUpFormAction } from '@/lib/actions/security-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityHistory } from '@/components/SecurityHistory';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { INCIDENT_STATUS_LABEL, SEVERITY_LABEL, SEVERITY_CHIP, STATUS_CHIP } from '@/lib/security-rules';
import { formatDateTime } from '@/lib/utils/format-date';

const DONE: Record<string, string> = { reported: 'Incident reported — the Chief Security Officer has been emailed.', assign: 'Assigned — the officer has been emailed.', close: 'Incident closed.', reopen: 'Incident reopened.', follow_up: 'Follow-up saved.' };
const HREF: Record<string, string> = { Visit: '/security/visitors/', ExitPass: '/security/exit-passes/', RoadTestPermit: '/security/road-tests/', VehicleGateExit: '/security/vehicles/exits/', GateDelivery: '/security/deliveries/', ContractorPass: '/security/contractors/' };

export default async function IncidentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  const { id } = await params;
  const { status, error } = await searchParams;
  const [inc, roles, history, staff] = await Promise.all([getIncident(id), getSecurityRoles(), getSecurityHistory('SecurityIncident', id), listGateStaffOptions()]);
  if (!inc) notFound();
  const isChief = roles.isCso || roles.isMaster;
  const input = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const btn = 'rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90';
  const line = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]';
  const Hidden = ({ action }: { action: string }) => (<><FormPendingOverlay /><input type="hidden" name="incidentId" value={inc.id} /><input type="hidden" name="action" value={action} /></>);
  const Row = ({ k, val }: { k: string; val: string | null | undefined }) => (val ? <div className="flex justify-between gap-3 py-1 text-sm"><dt className="text-[var(--ejo-text-muted)]">{k}</dt><dd className="text-right text-[var(--ejo-text)]">{val}</dd></div> : null);
  return (
    <div className="p-4 sm:p-8">
      <LoadingLink href="/security/incidents" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Incidents</LoadingLink>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{inc.incidentNumber} — {inc.type}</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{formatDateTime(inc.occurredAt)} · {inc.location}</p>
        </div>
        <div className="flex gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${SEVERITY_CHIP[inc.severity]}`}>{SEVERITY_LABEL[inc.severity]}</span>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_CHIP[inc.status] ?? ''}`}>{INCIDENT_STATUS_LABEL[inc.status]}</span>
        </div>
      </div>
      <SecurityNav active="/security/incidents" />
      {status && DONE[status] ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={DONE[status]!} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <dl className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
          <p className="mb-3 whitespace-pre-line text-sm text-[var(--ejo-text)]">{inc.description}</p>
          <Row k="People involved" val={inc.peopleInvolved} />
          <Row k="Vehicle" val={inc.vehiclePlate} />
          <Row k="Action taken" val={inc.actionTaken} />
          <Row k="Reported by" val={`${inc.reportedBy.fullName} · ${formatDateTime(inc.createdAt)}`} />
          <Row k="Assigned to" val={inc.assignedTo?.fullName} />
          <Row k="Resolution" val={inc.resolution} />
          <Row k="Closed" val={inc.closedAt ? `${formatDateTime(inc.closedAt)}${inc.closedBy ? ` · ${inc.closedBy.fullName}` : ''}` : null} />
          {inc.relatedType && inc.relatedId ? <p className="mt-2 text-xs"><LoadingLink href={`${HREF[inc.relatedType] ?? '/security/register?q='}${inc.relatedId}`} className="text-[var(--ejo-primary)] hover:underline">Related: {inc.relatedNumber} →</LoadingLink></p> : null}
        </dl>
        <div className="h-fit space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Actions</h2>
          {isChief && inc.status !== 'CLOSED' ? (
            <>
              <form action={incidentActionFormAction} className="flex flex-wrap gap-2">
                <Hidden action="assign" />
                <select name="assigneeId" required defaultValue="" className={`${input} min-w-0 flex-1`}>
                  <option value="" disabled>Assign to…</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                </select>
                <SubmitButton label="Assign" pendingLabel="Saving…" className={line} />
              </form>
              <form action={incidentActionFormAction} className="space-y-2 border-t border-[var(--ejo-border)] pt-3">
                <Hidden action="close" />
                <textarea name="resolution" required rows={2} placeholder="How it was resolved" className={`${input} w-full`} />
                <SubmitButton label="Close incident" pendingLabel="Saving…" className={btn} />
              </form>
            </>
          ) : null}
          {isChief && inc.status === 'CLOSED' ? (
            <form action={incidentActionFormAction} className="flex flex-wrap gap-2"><Hidden action="reopen" /><input name="reason" required placeholder="Reason for reopening" className={`${input} min-w-0 flex-1`} /><SubmitButton label="Reopen" pendingLabel="Saving…" className={line} /></form>
          ) : null}
          {!isChief ? <p className="text-sm text-[var(--ejo-text-muted)]">The Chief Security Officer reviews and closes incidents.</p> : null}
          {roles.isFrontDesk && inc.status !== 'CLOSED' ? (
            <form action={securityFollowUpFormAction} className="flex flex-wrap gap-2 border-t border-[var(--ejo-border)] pt-3"><FormPendingOverlay /><input type="hidden" name="entityType" value="SecurityIncident" /><input type="hidden" name="entityId" value={inc.id} /><input name="note" required placeholder="Follow-up note" className={`${input} min-w-0 flex-1`} /><SubmitButton label="Add note" pendingLabel="Saving…" className={line} /></form>
          ) : null}
        </div>
      </div>
      <SecurityHistory history={history} />
    </div>
  );
}
