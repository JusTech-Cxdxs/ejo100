import { notFound } from 'next/navigation';
import { getWarrantyPolicy, getWarrantyPolicyAuditTrail, listWarrantyProviders, getWarrantyRoles } from '@/lib/actions/warranty';
import {
  updateWarrantyPolicyFormAction,
  setWarrantyPolicyActiveFormAction,
  requestWarrantyPolicyDeletionFormAction,
  approveWarrantyPolicyDeletionFormAction,
  declineWarrantyPolicyDeletionFormAction,
} from '@/lib/actions/warranty-form-handlers';
import { requireUser } from '@/lib/actions/workshop';
import { LoadingLink } from '@/components/LoadingLink';
import { AuditTrail } from '@/components/AuditTrail';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { LineItemsInput } from '@/components/LineItemsInput';
import { pluralize } from '@/lib/utils/pluralize';
import { splitLines } from '@/lib/warranty-state';
import { formatDateTime } from '@/lib/utils/format-date';

const ACTION_LABEL: Record<string, string> = {
  'warranty_policy.created': 'Policy created',
  'warranty_policy.updated': 'Policy edited',
  'warranty_policy.activated': 'Policy activated',
  'warranty_policy.deactivated': 'Policy deactivated',
  'warranty_policy.deletion_requested': 'Deletion requested',
  'warranty_policy.deletion_hod_approved': 'Deletion approved by the Warranty HOD',
  'warranty_policy.deletion_declined': 'Deletion declined',
  'warranty_policy.archived': 'Policy archived (deletion approved — it had issued warranties)',
  'warranty_policy.deleted': 'Policy deleted',
};
const FIELD: Record<string, string> = {
  name: 'Name', kind: 'Applies to', providerId: 'Provider', brand: 'Brand', model: 'Model', durationMonths: 'Months',
  distanceLimit: 'Km limit', coverageSummary: 'Covered', exclusions: 'Not covered', conditions: 'Conditions',
};
const BANNER: Record<string, string> = {
  policy_updated: 'Policy saved — every change is on the audit trail. Warranties already issued keep their original terms.',
  deletion_requested: 'Deletion requested — the approvers have been notified.',
  deletion_declined: 'Deletion declined — the requester has been notified.',
};
const STEP: Record<string, string> = { PENDING_HOD: 'Waiting on the Warranty HOD', PENDING_MANAGER: 'Waiting on the Branch Manager', APPROVED: 'Approved', DECLINED: 'Declined' };

function Items({ label, text }: { label: string; text: string | null }) {
  const items = splitLines(text);
  return (
    <div>
      <p className="text-xs font-medium text-[var(--ejo-text-muted)]">{label} ({items.length})</p>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">—</p>
      ) : (
        <ol className="mt-1 list-decimal pl-5 text-sm text-[var(--ejo-text)]">
          {items.map((it, i) => <li key={i}>{it}</li>)}
        </ol>
      )}
    </div>
  );
}

function describeChange(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v).split('\n').join('; ');
}

export default async function WarrantyPolicyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string; edit?: string }> }) {
  const { id } = await params;
  const { status, error, edit } = await searchParams;
  const [policy, trail, providers, roles, viewer] = await Promise.all([getWarrantyPolicy(id), getWarrantyPolicyAuditTrail(id), listWarrantyProviders(), getWarrantyRoles(), requireUser()]);
  if (!policy) notFound();
  const archived = Boolean(policy.archivedAt);
  const editing = edit === '1' && roles.canApprove && !archived;
  const open = policy.deletionRequests.find((r: (typeof policy.deletionRequests)[number]) => r.status === 'PENDING_HOD' || r.status === 'PENDING_MANAGER') ?? null;
  const canDecide =
    open &&
    (roles.isMaster || open.requestedById !== viewer.id) &&
    ((open.status === 'PENDING_HOD' && (roles.isHod || roles.isMaster)) || (open.status === 'PENDING_MANAGER' && (roles.isManager || roles.isMaster)));
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';

  return (
    <div className="p-8">
      <LoadingLink href="/warranty/policies" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Policies</LoadingLink>
      {status && BANNER[status] ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={BANNER[status]} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{policy.name}</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
            {policy.code} · {policy.kind === 'ASSET' ? `Vehicle${policy.brand ? ` — ${[policy.brand, policy.model].filter(Boolean).join(' ')}` : ''}` : 'Part'} · {policy.provider.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {policy.isSample ? <span className="rounded-full bg-[var(--ejo-warning)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-warning)]">Sample terms</span> : null}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${archived ? 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]' : policy.isActive ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]' : 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'}`}>
            {archived ? 'Archived' : policy.isActive ? 'Active' : 'Inactive'}
          </span>
          {roles.canApprove && !archived && !editing ? (
            <LoadingLink href={`/warranty/policies/${policy.id}?edit=1`} className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">Edit</LoadingLink>
          ) : null}
          {roles.canApprove && !archived ? (
            <form action={setWarrantyPolicyActiveFormAction}>
              <FormPendingOverlay />
              <input type="hidden" name="policyId" value={policy.id} />
              <input type="hidden" name="isActive" value={policy.isActive ? 'false' : 'true'} />
              <SubmitButton label={policy.isActive ? 'Deactivate' : 'Activate'} pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
            </form>
          ) : null}
        </div>
      </div>
      {archived ? (
        <div className="mb-6 max-w-3xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 text-sm text-[var(--ejo-text-muted)]">
          Archived {policy.archivedAt ? formatDateTime(policy.archivedAt) : ''} — {policy.archivedReason}. It can no longer be used or edited; the{' '}
          {pluralize(policy._count.warranties, 'warranty', 'warranties')} it issued remain valid and traceable.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {editing ? (
            <form action={updateWarrantyPolicyFormAction} className="space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-primary)]/40 bg-[var(--ejo-surface)] p-6">
              <FormPendingOverlay />
              <input type="hidden" name="policyId" value={policy.id} />
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Edit policy {policy.code}</h2>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={label}>Name</label><input name="name" required defaultValue={policy.name} className={input} /></div>
                <div>
                  <label className={label}>Applies to</label>
                  <select name="kind" defaultValue={policy.kind} className={input}><option value="ASSET">Vehicle</option><option value="PART">Part</option></select>
                </div>
              </div>
              <div>
                <label className={label}>Provider</label>
                <select name="providerId" defaultValue={policy.providerId} className={input}>
                  {providers.filter((p: (typeof providers)[number]) => p.isActive || p.id === policy.providerId).map((p: (typeof providers)[number]) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={label}>Brand</label><input name="brand" defaultValue={policy.brand ?? ''} className={input} /></div>
                <div><label className={label}>Model</label><input name="model" defaultValue={policy.model ?? ''} className={input} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={label}>Months</label><input name="durationMonths" type="number" min={1} max={240} required defaultValue={policy.durationMonths} className={input} /></div>
                <div><label className={label}>Km limit (blank = none)</label><input name="distanceLimit" type="number" min={1} defaultValue={policy.distanceLimit ?? ''} className={input} /></div>
              </div>
              <div><label className={label}>What is covered</label><LineItemsInput name="coverageItem" required initialItems={splitLines(policy.coverageSummary)} placeholder="e.g. Engine" addLabel="+ Add covered item" /></div>
              <div><label className={label}>Not covered</label><LineItemsInput name="exclusionItem" initialItems={splitLines(policy.exclusions)} placeholder="e.g. Brake pads" addLabel="+ Add exclusion" /></div>
              <div><label className={label}>Conditions</label><LineItemsInput name="conditionItem" initialItems={splitLines(policy.conditions)} placeholder="e.g. Serviced on schedule" addLabel="+ Add condition" /></div>
              <p className="text-[11px] text-[var(--ejo-text-muted)]">The code {policy.code} stays fixed. Warranties already issued keep the terms they were issued with.</p>
              <div className="flex gap-2">
                <SubmitButton label="Save changes" pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
                <LoadingLink href={`/warranty/policies/${policy.id}`} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">Cancel</LoadingLink>
              </div>
            </form>
          ) : (
            <div className="space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
              <p className="text-sm text-[var(--ejo-text)]">
                {pluralize(policy.durationMonths, 'month')}{policy.distanceLimit ? ` or ${policy.distanceLimit.toLocaleString('en-NG')} km, whichever comes first` : ', no distance limit'}
              </p>
              <Items label="What is covered" text={policy.coverageSummary} />
              <Items label="Not covered" text={policy.exclusions} />
              <Items label="Conditions" text={policy.conditions} />
            </div>
          )}

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
                    ? Object.entries(changes).map(([k, c]) => `${FIELD[k] ?? k}: ${describeChange(c.from)} → ${describeChange(c.to)}`).join(' | ')
                    : typeof meta.reason === 'string'
                      ? `Reason: ${meta.reason}`
                      : null,
                  dateLabel: formatDateTime(e.createdAt),
                };
              })}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 text-sm">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">In use</h2>
            <p className="mt-2 text-[var(--ejo-text)]">
              <LoadingLink href={`/warranty?q=${encodeURIComponent(policy.code)}`} className="text-[var(--ejo-primary)] hover:underline">
                {pluralize(policy._count.warranties, 'warranty', 'warranties')} issued
              </LoadingLink>
            </p>
            {policy.kind === 'PART' ? (
              <div className="mt-2">
                <p className="text-xs text-[var(--ejo-text-muted)]">{pluralize(policy._count.parts, 'part')} carry it</p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {policy.parts.map((pt: (typeof policy.parts)[number]) => (
                    <li key={pt.id}>
                      <LoadingLink href={`/inventory/parts/${pt.id}`} className="text-[var(--ejo-primary)] hover:underline">{pt.name}{pt.partNumber ? ` (${pt.partNumber})` : ''}</LoadingLink>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">Created by {policy.createdBy.fullName} · {formatDateTime(policy.createdAt)}</p>
          </div>

          <div id="deletion" className="scroll-mt-24 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Delete policy</h2>
            {open ? (
              <div className="mt-2 space-y-2 text-xs">
                <p className="text-[var(--ejo-text)]">
                  Requested by {open.requestedBy.fullName} · {formatDateTime(open.requestedAt)} — {open.reason}
                </p>
                <ol className="space-y-1">
                  <li className="text-[var(--ejo-success)]">✓ Requested</li>
                  <li className={open.hodDecidedAt ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-warning)]'}>
                    {open.hodDecidedAt ? `✓ Warranty HOD — ${open.hodDecidedBy?.fullName ?? ''}` : '… Warranty HOD'}
                  </li>
                  <li className={open.managerDecidedAt ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-text-muted)]'}>
                    {open.managerDecidedAt ? `✓ Branch Manager — ${open.managerDecidedBy?.fullName ?? ''}` : '… Branch Manager'}
                  </li>
                </ol>
                <p className="font-medium text-[var(--ejo-text)]">{STEP[open.status]}</p>
                <p className="text-[var(--ejo-text-muted)]">
                  {policy._count.warranties > 0
                    ? `On approval it will be ARCHIVED (it issued ${pluralize(policy._count.warranties, 'warranty', 'warranties')} — they stay valid).`
                    : 'On approval it will be deleted (it has never issued a warranty).'}
                </p>
                {canDecide ? (
                  <div className="space-y-2 pt-1">
                    <form action={approveWarrantyPolicyDeletionFormAction}>
                      <FormPendingOverlay />
                      <input type="hidden" name="policyId" value={policy.id} />
                      <input type="hidden" name="requestId" value={open.id} />
                      <SubmitButton label="Approve" pendingLabel="Approving…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
                    </form>
                    <form action={declineWarrantyPolicyDeletionFormAction} className="space-y-2">
                      <FormPendingOverlay />
                      <input type="hidden" name="policyId" value={policy.id} />
                      <input type="hidden" name="requestId" value={open.id} />
                      <input name="reason" required placeholder="Reason for declining" className={input} />
                      <SubmitButton label="Decline" pendingLabel="Declining…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
                    </form>
                  </div>
                ) : null}
              </div>
            ) : archived ? (
              <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">This policy is archived.</p>
            ) : roles.isStaff ? (
              <form action={requestWarrantyPolicyDeletionFormAction} className="mt-2 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="policyId" value={policy.id} />
                <textarea name="reason" required rows={2} placeholder="Why should this policy be deleted?" className={input} />
                <p className="text-[11px] text-[var(--ejo-text-muted)]">
                  Approved by the Warranty HOD, then the Branch Manager. A policy that has issued warranties is archived instead of erased.
                </p>
                <SubmitButton label="Request deletion" pendingLabel="Requesting…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10" />
              </form>
            ) : (
              <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Warranty staff can request a deletion.</p>
            )}
            {policy.deletionRequests.filter((r: (typeof policy.deletionRequests)[number]) => r.status === 'DECLINED').slice(0, 3).map((r: (typeof policy.deletionRequests)[number]) => (
              <p key={r.id} className="mt-2 text-[11px] text-[var(--ejo-text-muted)]">Earlier request declined {formatDateTime(r.updatedAt)} — {r.declineReason}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
