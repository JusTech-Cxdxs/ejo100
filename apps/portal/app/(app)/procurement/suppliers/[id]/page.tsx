import { allows, guardAnyPage } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getSupplier, getSupplierAuditTrail } from '@/lib/actions/procurement';
import { updateSupplierFormAction } from '@/lib/actions/procurement-form-handlers';
import { humanizeAction } from '@/lib/humanize-action';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { AuditTrail } from '@/components/AuditTrail';
import { LoadingLink } from '@/components/LoadingLink';
import { SupplierFields } from '@/components/procurement/SupplierFields';
import { BackLink, PageTitle, StatusChip, SectionCard } from '@/components/ui';
import { PO_STATUS_LABEL, PO_STATUS_TONE, CLAIM_STATUS_LABEL, type PurchaseOrderStatus, type SupplierClaimStatus } from '@/lib/procurement-core';
import { Banners, BTN, BTN_LINE, CARD, Field, LINK, amount, day, when } from '@/components/warehouse/forms';

const BANNER: Record<string, string> = { created: 'Supplier added.', saved: 'Supplier saved.' };

export default async function SupplierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string; edit?: string }> }) {
  await guardAnyPage(['procurement.view'], '/procurement/suppliers');
  const { id } = await params;
  const { status, error, edit } = await searchParams;
  const [s, trail, canManage] = await Promise.all([getSupplier(id), getSupplierAuditTrail(id), allows('procurement.po.manage')]);
  if (!s) notFound();
  const editing = edit === '1' && canManage;
  return (
    <div className="p-8">
      <BackLink href="/procurement/suppliers" label="Back to Suppliers" />
      <Banners status={status} error={error} map={BANNER} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon="handshake">{s.name}</PageTitle>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{[s.country, s.currency, s.leadTimeDays !== null ? `${s.leadTimeDays}-day lead time` : null].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={s.isActive ? 'ACTIVE' : 'INACTIVE'} label={s.isActive ? 'Active' : 'Inactive'} className="px-3 py-1 text-sm" />
          {canManage && !editing ? <LoadingLink href={`/procurement/suppliers/${s.id}?edit=1`} className={BTN_LINE}>Edit</LoadingLink> : null}
          {canManage ? <LoadingLink href={`/procurement/orders/new?supplier=${s.id}`} className={BTN}>New purchase order</LoadingLink> : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {editing ? (
            <form action={updateSupplierFormAction} className={`${CARD} relative space-y-4 border-[var(--ejo-primary)]/40`}>
              <FormPendingOverlay />
              <input type="hidden" name="supplierId" value={s.id} />
              <SupplierFields d={s} />
              <label className="flex items-center gap-2 text-sm text-[var(--ejo-text)]"><input type="checkbox" name="isActive" value="1" defaultChecked={s.isActive} /> Active (orders can be raised)</label>
              <input type="hidden" name="isActive" value="0" />
              <div className="flex gap-2"><SubmitButton label="Save" pendingLabel="Saving…" className={BTN} /><LoadingLink href={`/procurement/suppliers/${s.id}`} className={BTN_LINE}>Cancel</LoadingLink></div>
            </form>
          ) : (
            <div className={`${CARD} grid gap-4 sm:grid-cols-2`}>
              <Field label="Contact">{[s.contactName, s.email, s.phone].filter(Boolean).join(' · ') || '—'}</Field>
              <Field label="Address">{s.address ?? '—'}</Field>
              <Field label="Payment terms">{s.paymentTerms ?? '—'}</Field>
              <Field label="Added">{day(s.createdAt)}</Field>
            </div>
          )}

          <SectionCard icon="cart" title={`Purchase orders (${s.purchaseOrders.length})`}>
            {s.purchaseOrders.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">None yet.</p> : (
              <ul className="divide-y divide-[var(--ejo-border)] text-sm">
                {s.purchaseOrders.map((o) => <li key={o.id} className="flex items-center justify-between gap-2 py-2"><span><LoadingLink href={`/procurement/orders/${o.id}`} className={LINK}>{o.number}</LoadingLink><span className="block text-xs text-[var(--ejo-text-muted)]">{amount(o.total, o.currency)} · {day(o.createdAt)}{o.expectedDate ? ` · expected ${day(o.expectedDate)}` : ''}</span></span><StatusChip status={o.status} label={PO_STATUS_LABEL[o.status as PurchaseOrderStatus]} tone={PO_STATUS_TONE[o.status as PurchaseOrderStatus]} /></li>)}
              </ul>
            )}
          </SectionCard>
          <SectionCard icon="alert" title={`Claims (${s.claims.length})`} actions={canManage ? <LoadingLink href={`/procurement/claims/new?supplier=${s.id}`} className={LINK}>Raise a claim</LoadingLink> : null}>
            {s.claims.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">None.</p> : (
              <ul className="divide-y divide-[var(--ejo-border)] text-sm">
                {s.claims.map((c) => <li key={c.id} className="flex items-center justify-between gap-2 py-2"><span><LoadingLink href={`/procurement/claims/${c.id}`} className={LINK}>{c.number}</LoadingLink><span className="block text-xs text-[var(--ejo-text-muted)]">{amount(c.amount, c.currency)} · {c.description.slice(0, 80)}</span></span><StatusChip status={c.status} label={CLAIM_STATUS_LABEL[c.status as SupplierClaimStatus]} /></li>)}
              </ul>
            )}
          </SectionCard>
        </div>
        <div className={CARD}>
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit trail</h2>
          <AuditTrail entries={trail.map((e) => ({ id: e.id, actionLabel: humanizeAction(e.action), userName: e.userName, detail: null, dateLabel: when(e.createdAt) }))} />
        </div>
      </div>
    </div>
  );
}
