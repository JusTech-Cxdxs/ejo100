import { notFound } from 'next/navigation';
import { getWarrantyProvider, getWarrantyProviderAuditTrail, getWarrantyRoles } from '@/lib/actions/warranty';
import {
  updateWarrantyProviderFormAction,
  setWarrantyProviderActiveFormAction,
  requestWarrantyProviderDeletionFormAction,
  approveWarrantyProviderDeletionFormAction,
  declineWarrantyProviderDeletionFormAction,
} from '@/lib/actions/warranty-form-handlers';
import { requireUser } from '@/lib/actions/workshop';
import { LoadingLink } from '@/components/LoadingLink';
import { AuditTrail } from '@/components/AuditTrail';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { pluralize } from '@/lib/utils/pluralize';
import { PROVIDER_TYPE_LABEL } from '@/lib/warranty-claim-status';
import { formatDateTime } from '@/lib/utils/format-date';

const ACTION_LABEL: Record<string, string> = {
  'warranty_provider.created': 'Provider created',
  'warranty_provider.updated': 'Provider edited',
  'warranty_provider.activated': 'Provider activated',
  'warranty_provider.deactivated': 'Provider deactivated',
  'warranty_provider.deletion_requested': 'Deletion requested',
  'warranty_provider.deletion_hod_approved': 'Deletion approved by the Warranty HOD',
  'warranty_provider.deletion_declined': 'Deletion declined',
  'warranty_provider.archived': 'Provider archived (deletion approved — it was in use)',
  'warranty_provider.deleted': 'Provider deleted',
};
const FIELD: Record<string, string> = {
  name: 'Name', type: 'Type', contactName: 'Contact', email: 'Email', phone: 'Phone',
  claimSubmissionDays: 'Claim within (days)', partRetentionDays: 'Keep failed parts (days)', notes: 'Notes',
};
const BANNER: Record<string, string> = {
  provider_updated: 'Provider saved — every change is on the audit trail.',
  deletion_requested: 'Deletion requested — the approvers have been notified.',
  deletion_declined: 'Deletion declined — the requester has been notified.',
};

export default async function WarrantyProviderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string; edit?: string }> }) {
  const { id } = await params;
  const { status, error, edit } = await searchParams;
  const [p, trail, roles, viewer] = await Promise.all([getWarrantyProvider(id), getWarrantyProviderAuditTrail(id), getWarrantyRoles(), requireUser()]);
  if (!p) notFound();
  const archived = Boolean(p.archivedAt);
  const editing = edit === '1' && roles.canApprove && !archived;
  const inUse = p._count.policies + p._count.warranties + p._count.claims > 0;
  const open = p.deletionRequests.find((r: (typeof p.deletionRequests)[number]) => r.status === 'PENDING_HOD' || r.status === 'PENDING_MANAGER') ?? null;
  const canDecide =
    open &&
    (roles.isMaster || open.requestedById !== viewer.id) &&
    ((open.status === 'PENDING_HOD' && (roles.isHod || roles.isMaster)) || (open.status === 'PENDING_MANAGER' && (roles.isManager || roles.isMaster)));
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';

  return (
    <div className="p-8">
      <LoadingLink href="/warranty/providers" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Providers</LoadingLink>
      {status && BANNER[status] ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={BANNER[status]} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{p.name}</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{PROVIDER_TYPE_LABEL[p.type] ?? p.type}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${archived ? 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]' : p.isActive ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]' : 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'}`}>
            {archived ? 'Archived' : p.isActive ? 'Active' : 'Inactive'}
          </span>
          {roles.canApprove && !archived && !editing ? (
            <LoadingLink href={`/warranty/providers/${p.id}?edit=1`} className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">Edit</LoadingLink>
          ) : null}
          {roles.canApprove && !archived ? (
            <form action={setWarrantyProviderActiveFormAction}>
              <FormPendingOverlay />
              <input type="hidden" name="providerId" value={p.id} />
              <input type="hidden" name="isActive" value={p.isActive ? 'false' : 'true'} />
              <SubmitButton label={p.isActive ? 'Deactivate' : 'Activate'} pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
            </form>
          ) : null}
        </div>
      </div>
      {archived ? (
        <div className="mb-6 max-w-3xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 text-sm text-[var(--ejo-text-muted)]">
          Archived {p.archivedAt ? formatDateTime(p.archivedAt) : ''} — {p.archivedReason}. It can no longer be used or edited; its policies, warranties and claims remain valid and traceable.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {editing ? (
            <form action={updateWarrantyProviderFormAction} className="space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-primary)]/40 bg-[var(--ejo-surface)] p-6">
              <FormPendingOverlay />
              <input type="hidden" name="providerId" value={p.id} />
              <div className="grid grid-cols-2 gap-2">
                <div><label className={label}>Name</label><input name="name" required defaultValue={p.name} className={input} /></div>
                <div><label className={label}>Type</label><select name="type" defaultValue={p.type} className={input}>{Object.entries(PROVIDER_TYPE_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
              </div>
              <div><label className={label}>Contact name</label><input name="contactName" defaultValue={p.contactName ?? ''} className={input} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={label}>Email</label><input name="email" type="email" defaultValue={p.email ?? ''} className={input} /></div>
                <div><label className={label}>Phone</label><input name="phone" defaultValue={p.phone ?? ''} className={input} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={label}>Claim within (days)</label><input name="claimSubmissionDays" type="number" min={1} defaultValue={p.claimSubmissionDays ?? ''} className={input} /></div>
                <div><label className={label}>Keep failed parts (days)</label><input name="partRetentionDays" type="number" min={1} defaultValue={p.partRetentionDays ?? ''} className={input} /></div>
              </div>
              <div><label className={label}>Notes</label><textarea name="notes" rows={2} defaultValue={p.notes ?? ''} className={input} /></div>
              <p className="text-[11px] text-[var(--ejo-text-muted)]">Claims already opened keep their deadline; new rules apply to claims opened from now on.</p>
              <div className="flex gap-2">
                <SubmitButton label="Save changes" pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
                <LoadingLink href={`/warranty/providers/${p.id}`} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">Cancel</LoadingLink>
              </div>
            </form>
          ) : (
            <div className="grid gap-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6 text-sm sm:grid-cols-2">
              <div><p className="text-xs text-[var(--ejo-text-muted)]">Contact</p><p className="text-[var(--ejo-text)]">{p.contactName ?? '—'}</p></div>
              <div><p className="text-xs text-[var(--ejo-text-muted)]">Email / phone</p><p className="text-[var(--ejo-text)]">{[p.email, p.phone].filter(Boolean).join(' · ') || '—'}</p></div>
              <div><p className="text-xs text-[var(--ejo-text-muted)]">Claim within</p><p className="text-[var(--ejo-text)]">{p.claimSubmissionDays !== null ? pluralize(p.claimSubmissionDays, 'day') + ' of the failure' : 'Not set'}</p></div>
              <div><p className="text-xs text-[var(--ejo-text-muted)]">Keep failed parts</p><p className="text-[var(--ejo-text)]">{p.partRetentionDays !== null ? pluralize(p.partRetentionDays, 'day') + ' from submission' : 'Not set'}</p></div>
              {p.notes ? <div className="sm:col-span-2"><p className="text-xs text-[var(--ejo-text-muted)]">Notes</p><p className="whitespace-pre-line text-[var(--ejo-text)]">{p.notes}</p></div> : null}
            </div>
          )}

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Policies ({p.policies.length})</h2>
            {p.policies.length === 0 ? <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">No policies use this provider.</p> : (
              <ul className="mt-2 space-y-1 text-sm">
                {p.policies.map((pol: (typeof p.policies)[number]) => (
                  <li key={pol.id} className="flex items-center justify-between gap-2">
                    <LoadingLink href={`/warranty/policies/${pol.id}`} className="text-[var(--ejo-primary)] hover:underline">{pol.name} ({pol.code})</LoadingLink>
                    <span className="text-xs text-[var(--ejo-text-muted)]">{pol.kind === 'ASSET' ? 'Vehicle' : 'Part'} · {pol.archivedAt ? 'Archived' : pol.isActive ? 'Active' : 'Inactive'}{pol.isSample ? ' · Sample' : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit trail</h2>
            <AuditTrail
              entries={trail.map((e: (typeof trail)[number]) => {
                const meta = (e.metadata ?? {}) as Record<string, unknown>;
                const changes = meta.changes as Record<string, { from: unknown; to: unknown }> | undefined;
                return {
                  id: e.id,
                  actionLabel: ACTION_LABEL[e.action] ?? e.action,
                  userName: e.userName,
                  detail: changes
                    ? Object.entries(changes).map(([k, c]) => `${FIELD[k] ?? k}: ${c.from ?? '—'} → ${c.to ?? '—'}`).join(' | ')
                    : typeof meta.reason === 'string' ? `Reason: ${meta.reason}` : null,
                  dateLabel: formatDateTime(e.createdAt),
                };
              })}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 text-sm">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">In use</h2>
            <p className="mt-2 text-[var(--ejo-text)]">{pluralize(p._count.policies, 'policy', 'policies')}</p>
            <p className="text-[var(--ejo-text)]">
              <LoadingLink href={`/warranty?q=${encodeURIComponent(p.name)}`} className="text-[var(--ejo-primary)] hover:underline">{pluralize(p._count.warranties, 'warranty', 'warranties')}</LoadingLink>
            </p>
            <p className="text-[var(--ejo-text)]">
              <LoadingLink href={`/warranty/claims?q=${encodeURIComponent(p.name)}`} className="text-[var(--ejo-primary)] hover:underline">{pluralize(p._count.claims, 'claim')}</LoadingLink>
            </p>
            <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">Created by {p.createdBy.fullName} · {formatDateTime(p.createdAt)}</p>
          </div>

          <div id="deletion" className="scroll-mt-24 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Delete provider</h2>
            {open ? (
              <div className="mt-2 space-y-2 text-xs">
                <p className="text-[var(--ejo-text)]">Requested by {open.requestedBy.fullName} · {formatDateTime(open.requestedAt)} — {open.reason}</p>
                <ol className="space-y-1">
                  <li className="text-[var(--ejo-success)]">✓ Requested</li>
                  <li className={open.hodDecidedAt ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-warning)]'}>{open.hodDecidedAt ? `✓ Warranty HOD — ${open.hodDecidedBy?.fullName ?? ''}` : '… Warranty HOD'}</li>
                  <li className={open.managerDecidedAt ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-text-muted)]'}>{open.managerDecidedAt ? `✓ Branch Manager — ${open.managerDecidedBy?.fullName ?? ''}` : '… Branch Manager'}</li>
                </ol>
                <p className="text-[var(--ejo-text-muted)]">
                  {inUse ? 'On approval it will be ARCHIVED (it is in use); its active policies will be deactivated.' : 'On approval it will be deleted (it has never been used).'}
                </p>
                {canDecide ? (
                  <div className="space-y-2 pt-1">
                    <form action={approveWarrantyProviderDeletionFormAction}>
                      <FormPendingOverlay />
                      <input type="hidden" name="providerId" value={p.id} />
                      <input type="hidden" name="requestId" value={open.id} />
                      <SubmitButton label="Approve" pendingLabel="Approving…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
                    </form>
                    <form action={declineWarrantyProviderDeletionFormAction} className="space-y-2">
                      <FormPendingOverlay />
                      <input type="hidden" name="providerId" value={p.id} />
                      <input type="hidden" name="requestId" value={open.id} />
                      <input name="reason" required placeholder="Reason for declining" className={input} />
                      <SubmitButton label="Decline" pendingLabel="Declining…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
                    </form>
                  </div>
                ) : null}
              </div>
            ) : archived ? (
              <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">This provider is archived.</p>
            ) : roles.isStaff ? (
              <form action={requestWarrantyProviderDeletionFormAction} className="mt-2 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="providerId" value={p.id} />
                <textarea name="reason" required rows={2} placeholder="Why should this provider be deleted?" className={input} />
                <p className="text-[11px] text-[var(--ejo-text-muted)]">Approved by the Warranty HOD, then the Branch Manager. A provider in use is archived instead of erased.</p>
                <SubmitButton label="Request deletion" pendingLabel="Requesting…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10" />
              </form>
            ) : (
              <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Warranty staff can request a deletion.</p>
            )}
            {p.deletionRequests.filter((r: (typeof p.deletionRequests)[number]) => r.status === 'DECLINED').slice(0, 3).map((r: (typeof p.deletionRequests)[number]) => (
              <p key={r.id} className="mt-2 text-[11px] text-[var(--ejo-text-muted)]">Earlier request declined {formatDateTime(r.updatedAt)} — {r.declineReason}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
