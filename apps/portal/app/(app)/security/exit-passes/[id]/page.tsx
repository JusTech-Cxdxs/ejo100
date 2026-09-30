import { notFound } from 'next/navigation';
import { getExitPass, getSecurityRoles, getSecurityHistory, canDecideExitPass } from '@/lib/actions/security';
import { exitPassActionFormAction, extendExitPassFormAction, securityFollowUpFormAction } from '@/lib/actions/security-form-handlers';
import { PrintMenu } from '@/components/print/PrintMenu';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityHistory } from '@/components/SecurityHistory';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { EXIT_PASS_STATUS_LABEL, STATUS_CHIP, durationText, minutesBetween, exitPassOverdueMinutes } from '@/lib/security-rules';
import { formatDateTime } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';

const DONE: Record<string, string> = {
  requested: 'Exit pass submitted — your Department Head has been asked to authorise it.',
  approve: 'Decision recorded — the next person has been told.',
  decline: 'Exit pass declined — the requester has been told.',
  cancel: 'Exit pass cancelled.',
  gate_out: 'Time out recorded.',
  gate_in: 'Time in recorded — welcome back.',
  extended: 'Return time extended.',
  follow_up: 'Follow-up saved.',
};

export default async function ExitPassPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  const { id } = await params;
  const { status, error } = await searchParams;
  const [p, roles, history, canDecide] = await Promise.all([getExitPass(id), getSecurityRoles(), getSecurityHistory('ExitPass', id), canDecideExitPass(id)]);
  if (!p) notFound();
  const away = minutesBetween(p.gateOutAt, p.gateInAt);
  const late = p.gateInAt && p.expectedReturnAt ? minutesBetween(p.expectedReturnAt, p.gateInAt) : null;
  const overdue = exitPassOverdueMinutes(p);
  const input = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const btn = 'rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90';
  const line = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]';
  const Hidden = ({ action }: { action: string }) => (<><FormPendingOverlay /><input type="hidden" name="passId" value={p.id} /><input type="hidden" name="action" value={action} /></>);
  const Row = ({ k, val }: { k: string; val: string | null | undefined }) => (val ? <div className="flex justify-between gap-3 py-1 text-sm"><dt className="text-[var(--ejo-text-muted)]">{k}</dt><dd className="text-right text-[var(--ejo-text)]">{val}</dd></div> : null);
  const step = p.status === 'PENDING_HEAD' ? 'Authorise (Department Head)' : 'Approve (Manager)';

  return (
    <div className="p-4 sm:p-8">
      <LoadingLink href="/security/exit-passes" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Exit passes</LoadingLink>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Exit pass {p.passNumber}</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">Requested by {p.requestedBy.fullName} on {formatDateTime(p.createdAt)} · {pluralize(p.people.length, 'person', 'people')}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_CHIP[p.status]}`}>{EXIT_PASS_STATUS_LABEL[p.status]}</span>
      </div>
      <SecurityNav active="/security/exit-passes" />
      {status && DONE[status] ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={DONE[status]!} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {overdue > 0 ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={`Not back — past the expected return by ${durationText(overdue)}. The Chief Security Officer has been told.`} /></div> : null}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <ul className="divide-y divide-[var(--ejo-border)]">
            {p.people.map((x) => (
              <li key={x.id} className="py-2 text-sm">
                <p className="font-medium text-[var(--ejo-text)]">{x.name}{!x.userId ? <span className="ml-2 text-[11px] font-normal text-[var(--ejo-text-muted)]">not on staff</span> : null}</p>
                <p className="text-xs text-[var(--ejo-text-muted)]">{[x.employeeId ? `ID ${x.employeeId}` : null, x.designation, x.department].filter(Boolean).join(' · ') || '—'}</p>
              </li>
            ))}
          </ul>
          <dl>
            <Row k="Reason" val={p.reason} />
            <Row k="Return" val={p.returning ? 'Returning' : 'No return'} />
            <Row k="Planned time out" val={p.expectedOutAt ? formatDateTime(p.expectedOutAt) : null} />
            <Row k="Expected time in" val={p.expectedReturnAt ? formatDateTime(p.expectedReturnAt) : null} />
            <Row k="Authorised by (Department Head)" val={p.headApprovedBy && p.headApprovedAt ? `${p.headApprovedBy.fullName} · ${formatDateTime(p.headApprovedAt)}` : null} />
            <Row k="Approved by (Manager)" val={p.managerApprovedBy && p.managerApprovedAt ? `${p.managerApprovedBy.fullName} · ${formatDateTime(p.managerApprovedAt)}` : null} />
            <Row k="Declined" val={p.declinedBy && p.declinedAt ? `${p.declinedBy.fullName} · ${formatDateTime(p.declinedAt)} — ${p.declineReason ?? ''}` : null} />
            <Row k="Cancelled because" val={p.cancelReason} />
            <Row k="Time out" val={p.gateOutAt ? `${formatDateTime(p.gateOutAt)}${p.gateOutBy ? ` · ${p.gateOutBy.fullName}` : ''}` : null} />
            <Row k="Time in" val={p.gateInAt ? `${formatDateTime(p.gateInAt)}${p.gateInBy ? ` · ${p.gateInBy.fullName}` : ''}` : null} />
            <Row k="Away for" val={away !== null ? durationText(away) : null} />
            <Row k="Back late by" val={late !== null && late > 0 ? durationText(late) : null} />
          </dl>
        </div>
        <div className="h-fit space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Actions</h2>
          {canDecide ? (
            <>
              <form action={exitPassActionFormAction}><Hidden action="approve" /><SubmitButton label={step} pendingLabel="Saving…" className={btn} /></form>
              <form action={exitPassActionFormAction} className="flex flex-wrap gap-2"><Hidden action="decline" /><input name="reason" required placeholder="Reason for declining" className={`${input} min-w-0 flex-1`} /><SubmitButton label="Decline" pendingLabel="Saving…" className={line} /></form>
            </>
          ) : null}
          {(p.status === 'PENDING_HEAD' || p.status === 'PENDING_MANAGER') && !canDecide ? <p className="text-sm text-[var(--ejo-text-muted)]">{EXIT_PASS_STATUS_LABEL[p.status]}.</p> : null}
          {p.status === 'APPROVED' && roles.isGate ? <form action={exitPassActionFormAction}><Hidden action="gate_out" /><SubmitButton label="Record time out" pendingLabel="Saving…" className={btn} /></form> : null}
          {p.status === 'OUT' && roles.isGate ? <form action={exitPassActionFormAction}><Hidden action="gate_in" /><SubmitButton label="Record time in" pendingLabel="Saving…" className={btn} /></form> : null}
          {p.status === 'APPROVED' && !roles.isGate ? <p className="text-sm text-[var(--ejo-text-muted)]">Approved — show this pass at the gate.</p> : null}
          {['APPROVED', 'OUT', 'RETURNED', 'CLOSED'].includes(p.status) ? (
            <PrintMenu orgHref={`/print/exit-pass/${p.id}`} clientHref={`/print/exit-pass/${p.id}?variant=client`} clientLabel="Holder Copy" align="right" />
          ) : <p className="text-xs text-[var(--ejo-text-muted)]">The pass can be printed once it is approved.</p>}
          {p.status === 'OUT' && p.returning && roles.isGate ? (
            <form action={extendExitPassFormAction} className="flex flex-wrap gap-2 border-t border-[var(--ejo-border)] pt-3">
              <FormPendingOverlay />
              <input type="hidden" name="passId" value={p.id} />
              <select name="extraMinutes" required defaultValue="" className={input}>
                <option value="" disabled>Extend return by…</option>
                {[15, 30, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{durationText(m)}</option>)}
              </select>
              <input name="reason" required placeholder="Reason" className={`${input} min-w-0 flex-1`} />
              <SubmitButton label="Extend" pendingLabel="Saving…" className={line} />
            </form>
          ) : null}
          {roles.isFrontDesk && ['APPROVED', 'OUT'].includes(p.status) ? (
            <form action={securityFollowUpFormAction} className="flex flex-wrap gap-2 border-t border-[var(--ejo-border)] pt-3">
              <FormPendingOverlay />
              <input type="hidden" name="entityType" value="ExitPass" />
              <input type="hidden" name="entityId" value={p.id} />
              <input name="note" required placeholder="Follow-up note" className={`${input} min-w-0 flex-1`} />
              <SubmitButton label="Add note" pendingLabel="Saving…" className={line} />
            </form>
          ) : null}
          {['PENDING_HEAD', 'PENDING_MANAGER', 'APPROVED'].includes(p.status) && p.requestedBy.id === roles.userId ? (
            <form action={exitPassActionFormAction} className="flex flex-wrap gap-2 border-t border-[var(--ejo-border)] pt-3"><Hidden action="cancel" /><input name="reason" required placeholder="Reason for cancelling" className={`${input} min-w-0 flex-1`} /><SubmitButton label="Cancel pass" pendingLabel="Saving…" className="text-sm font-medium text-[var(--ejo-error)] hover:underline" /></form>
          ) : null}
        </div>
      </div>
      <SecurityHistory history={history} />
    </div>
  );
}
