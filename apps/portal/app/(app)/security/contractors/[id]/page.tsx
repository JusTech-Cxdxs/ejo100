import { notFound } from 'next/navigation';
import { getContractorPass, getSecurityRoles, getSecurityHistory, canDecideContractorPass } from '@/lib/actions/security';
import { contractorActionFormAction, securityFollowUpFormAction } from '@/lib/actions/security-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityHistory } from '@/components/SecurityHistory';
import { SecurityTable } from '@/components/SecurityTable';
import { PrintMenu } from '@/components/print/PrintMenu';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { CONTRACTOR_STATUS_LABEL, STATUS_CHIP, durationText, lagosDay, minutesBetween } from '@/lib/security-rules';
import { formatDateTime, formatDateTimeCompact } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';

const DONE: Record<string, string> = { requested: 'Pass requested — the Manager has been emailed.', approve: 'Approved — the staff member responsible and Security have been emailed.', decline: 'Declined — the requester has been emailed.', cancel: 'Pass cancelled.', revoke: 'Pass revoked — Security and the staff member responsible have been emailed.', sign_in: 'Team signed in.', sign_out: 'Team signed out.', follow_up: 'Follow-up saved.' };

export default async function ContractorPassPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  const { id } = await params;
  const { status, error } = await searchParams;
  const [p, roles, history, canDecide] = await Promise.all([getContractorPass(id), getSecurityRoles(), getSecurityHistory('ContractorPass', id), canDecideContractorPass(id)]);
  if (!p) notFound();
  const days = Math.round((new Date(p.validUntil).getTime() - new Date(p.validFrom).getTime()) / 86400000) + 1;
  const input = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const btn = 'rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90';
  const line = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]';
  const Hidden = ({ action }: { action: string }) => (<><FormPendingOverlay /><input type="hidden" name="passId" value={p.id} /><input type="hidden" name="action" value={action} /></>);
  const Row = ({ k, val }: { k: string; val: string | null | undefined }) => (val ? <div className="flex justify-between gap-3 py-1 text-sm"><dt className="text-[var(--ejo-text-muted)]">{k}</dt><dd className="text-right text-[var(--ejo-text)]">{val}</dd></div> : null);
  const canCancel = ['PENDING_MANAGER', 'APPROVED'].includes(p.status) && !p.onSite && (p.requestedBy.id === roles.userId || p.host.id === roles.userId || roles.isFrontDesk || roles.isMaster);
  return (
    <div className="p-4 sm:p-8">
      <LoadingLink href="/security/contractors" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Contractors</LoadingLink>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{p.passNumber} — {p.company}</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{p.work} · {p.workArea}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {p.status === 'APPROVED' ? <PrintMenu orgHref={`/print/contractor-pass/${p.id}`} clientHref={`/print/contractor-pass/${p.id}?variant=client`} clientLabel="Contractor Copy" align="right" /> : null}
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_CHIP[p.state] ?? 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'}`}>{CONTRACTOR_STATUS_LABEL[p.state]}</span>
        </div>
      </div>
      <SecurityNav active="/security/contractors" />
      {status && DONE[status] ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={DONE[status]!} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {p.afterHours > 0 ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={`Still on site ${durationText(p.afterHours)} past 5 pm closing.`} /></div> : null}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <dl className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
          <Row k="Team" val={`${pluralize(p.teamSize, 'person', 'people')} — ${[p.leadName + (p.teamSize > 1 ? ' (lead)' : ''), ...p.memberNames].join(', ')}`} />
          <Row k="Phone" val={p.phone} />
          <Row k="Valid" val={`${lagosDay(p.validFrom)} to ${lagosDay(p.validUntil)} (${pluralize(days, 'day')})`} />
          <Row k="Responsible" val={`${p.host.fullName}${p.host.phone ? ` · ${p.host.phone}` : ''}`} />
          <Row k="Requested by" val={`${p.requestedBy.fullName} · ${formatDateTime(p.createdAt)}`} />
          <Row k="Approved by (Manager)" val={p.managerApprovedBy && p.managerApprovedAt ? `${p.managerApprovedBy.fullName} · ${formatDateTime(p.managerApprovedAt)}` : null} />
          <Row k="Declined because" val={p.declineReason} />
          <Row k="Revoked" val={p.revokedBy && p.revokedAt ? `${p.revokedBy.fullName} · ${formatDateTime(p.revokedAt)} — ${p.revokeReason ?? ''}` : null} />
          <Row k="Cancelled because" val={p.cancelReason} />
          <Row k="On site now" val={p.onSite ? `${p.onSite.workersPresent} of ${p.teamSize} since ${formatDateTimeCompact(p.onSite.signedInAt)}` : null} />
        </dl>
        <div className="h-fit space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Actions</h2>
          {canDecide ? (
            <>
              <form action={contractorActionFormAction}><Hidden action="approve" /><SubmitButton label="Approve pass" pendingLabel="Saving…" className={btn} /></form>
              <form action={contractorActionFormAction} className="flex flex-wrap gap-2"><Hidden action="decline" /><input name="reason" required placeholder="Reason for declining" className={`${input} min-w-0 flex-1`} /><SubmitButton label="Decline" pendingLabel="Saving…" className={line} /></form>
            </>
          ) : p.status === 'PENDING_MANAGER' ? <p className="text-sm text-[var(--ejo-text-muted)]">Waiting for the Manager to approve.</p> : null}
          {p.state === 'ACTIVE' && roles.isGate ? (
            <form action={contractorActionFormAction} className="flex flex-wrap gap-2">
              <Hidden action="sign_in" />
              <select name="workersPresent" required defaultValue="" className={`${input} min-w-0 flex-1`}>
                <option value="" disabled>How many came today?</option>
                {Array.from({ length: p.teamSize }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{pluralize(n, 'person', 'people')}</option>)}
              </select>
              <SubmitButton label="Sign team in" pendingLabel="Saving…" className={btn} />
            </form>
          ) : null}
          {p.state === 'ON_SITE' && roles.isGate ? (
            <form action={contractorActionFormAction} className="flex flex-wrap gap-2"><Hidden action="sign_out" /><input name="note" placeholder="Note (optional)" className={`${input} min-w-0 flex-1`} /><SubmitButton label="Sign team out" pendingLabel="Saving…" className={btn} /></form>
          ) : null}
          {p.state === 'UPCOMING' ? <p className="text-sm text-[var(--ejo-text-muted)]">Approved — the team can be signed in from {lagosDay(p.validFrom)}.</p> : null}
          {p.state === 'ENDED' ? <p className="text-sm text-[var(--ejo-text-muted)]">This pass has ended — request a new one if more days are needed.</p> : null}
          {roles.isFrontDesk && ['PENDING_MANAGER', 'APPROVED'].includes(p.status) ? (
            <form action={securityFollowUpFormAction} className="flex flex-wrap gap-2 border-t border-[var(--ejo-border)] pt-3"><FormPendingOverlay /><input type="hidden" name="entityType" value="ContractorPass" /><input type="hidden" name="entityId" value={p.id} /><input name="note" required placeholder="Follow-up note" className={`${input} min-w-0 flex-1`} /><SubmitButton label="Add note" pendingLabel="Saving…" className={line} /></form>
          ) : null}
          {p.status === 'APPROVED' && !p.onSite && (roles.isCso || roles.isManager || roles.isMaster) ? (
            <form action={contractorActionFormAction} className="flex flex-wrap gap-2 border-t border-[var(--ejo-border)] pt-3"><Hidden action="revoke" /><input name="reason" required placeholder="Reason for revoking" className={`${input} min-w-0 flex-1`} /><SubmitButton label="Revoke pass" pendingLabel="Saving…" className="text-sm font-medium text-[var(--ejo-error)] hover:underline" /></form>
          ) : null}
          {canCancel ? (
            <form action={contractorActionFormAction} className="flex flex-wrap gap-2 border-t border-[var(--ejo-border)] pt-3"><Hidden action="cancel" /><input name="reason" required placeholder="Reason for cancelling" className={`${input} min-w-0 flex-1`} /><SubmitButton label="Cancel pass" pendingLabel="Saving…" className="text-sm font-medium text-[var(--ejo-error)] hover:underline" /></form>
          ) : null}
          <LoadingLink href={`/security/incidents/new?related=${p.passNumber}`} className="block text-xs text-[var(--ejo-primary)] hover:underline">Report an incident about this team →</LoadingLink>
        </div>
      </div>
      <h2 className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Attendance ({pluralize(p.attendance.length, 'day')})</h2>
      <div className="mb-6">
        <SecurityTable headers={['Signed in', 'Signed out', 'People', 'On site', 'Recorded by', 'Note']} widths={['18%', '18%', '10%', '12%', '24%', '18%']} empty={p.attendance.length ? null : 'Not signed in yet.'}>
          {p.attendance.map((a) => {
            const m = minutesBetween(a.signedInAt, a.signedOutAt);
            return (
              <tr key={a.id}>
                <td className="text-xs">{formatDateTimeCompact(a.signedInAt)}</td>
                <td className="text-xs">{a.signedOutAt ? formatDateTimeCompact(a.signedOutAt) : <span className="font-medium text-[var(--ejo-info)]">On site</span>}</td>
                <td className="text-xs">{a.workersPresent} of {p.teamSize}</td>
                <td className="text-xs">{m !== null ? durationText(m) : '—'}</td>
                <td className="text-xs">In: {a.signedInBy.fullName}{a.signedOutBy ? <span className="block">Out: {a.signedOutBy.fullName}</span> : null}</td>
                <td className="text-xs">{a.note ?? '—'}</td>
              </tr>
            );
          })}
        </SecurityTable>
      </div>
      <SecurityHistory history={history} />
    </div>
  );
}
