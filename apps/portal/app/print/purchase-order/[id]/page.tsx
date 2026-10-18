import { portalBaseUrl } from '@/lib/portal-url';
import { notFound } from 'next/navigation';
import { prisma } from '@ejo/database';
import { getPurchaseOrder } from '@/lib/actions/procurement';
import { getOrganisation } from '@/lib/actions/organisation';
import { DocumentHeader, SignatureBlock, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { PO_STATUS_LABEL, poTotalInNaira, type PurchaseOrderStatus } from '@/lib/procurement-core';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';

const money = (v: unknown, currency: string) => `${currency} ${Number(v ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', marginTop: '1px', whiteSpace: 'pre-line' }}>{value}</div>
    </div>
  );
}

/**
 * Purchase order on the organisation's letterhead, for the supplier
 * (?variant=client): the lines, currency, terms and delivery. The
 * organisation copy adds who raised and approved it and the naira value.
 */
export default async function PrintPurchaseOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrgCopy = variant !== 'client';
  const [po, organisation] = await Promise.all([getPurchaseOrder(id), getOrganisation()]);
  if (!po || !organisation) notFound();
  const branch = await prisma.branch.findUnique({ where: { id: po.branchId } });
  if (!branch) notFound();
  const naira = poTotalInNaira(Number(po.total), po.currency, po.exchangeRate === null ? null : Number(po.exchangeRate));
  const cell = { padding: '4px 6px', borderBottom: '1px solid #E2E8F0', fontSize: '11px', verticalAlign: 'top' } as const;
  const head = { ...cell, fontSize: '10px', color: '#475569', fontWeight: 700, textAlign: 'left' } as const;
  const right = { ...cell, textAlign: 'right' } as const;
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '28px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader
        organisation={organisation}
        branch={branch}
        logoUrl={`${portalBaseUrl()}/images/logo/logo.png`}
        documentTitle={isOrgCopy ? 'Purchase Order — Organisation Copy' : 'Purchase Order'}
        referenceNumber={po.number}
        statusLabel={PO_STATUS_LABEL[po.status as PurchaseOrderStatus]}
        accentColor="#E10600"
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 18px', marginTop: '16px' }}>
        <Field label="SUPPLIER" value={`${po.supplier.name}${po.supplier.country ? `\n${po.supplier.country}` : ''}${po.supplier.address ? `\n${po.supplier.address}` : ''}`} />
        <Field label="SUPPLIER CONTACT" value={[po.supplier.contactName, po.supplier.email, po.supplier.phone].filter(Boolean).join('\n') || '—'} />
        <Field label="DATE" value={formatDateOnly(po.createdAt)} />
        <Field label="CURRENCY" value={po.currency} />
        <Field label="INCOTERMS" value={po.incoterms ?? '—'} />
        <Field label="EXPECTED DELIVERY" value={po.expectedDate ? formatDateOnly(po.expectedDate) : '—'} />
        <Field label="PAYMENT TERMS" value={po.paymentTerms ?? po.supplier.paymentTerms ?? '—'} />
        <Field label="DELIVER TO" value={`${branch.name}${branch.address ? `\n${branch.address}` : ''}`} />
        {po.requisition ? <Field label="REQUISITION" value={po.requisition.number} /> : null}
      </div>

      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
        <thead><tr><th style={head}>#</th><th style={head}>Item</th><th style={{ ...head, textAlign: 'right' }}>Quantity</th><th style={{ ...head, textAlign: 'right' }}>Unit cost</th><th style={{ ...head, textAlign: 'right' }}>Amount</th></tr></thead>
        <tbody>
          {po.lines.map((l, i) => (
            <tr key={l.id}>
              <td style={cell}>{i + 1}</td>
              <td style={cell}>{l.part ? l.part.name : l.product ? l.product.name : l.description}<div style={{ fontSize: '10px', color: '#64748B' }}>{l.part?.partNumber ?? l.product?.sku ?? ''}{l.description && (l.part || l.product) && l.description !== (l.part?.name ?? l.product?.name) ? ` · ${l.description}` : ''}</div></td>
              <td style={right}>{Number(l.quantity)}{l.part ? ` ${l.part.baseUnitOfMeasure}` : ''}</td>
              <td style={right}>{money(l.unitCost, po.currency)}</td>
              <td style={right}>{money(Number(l.quantity) * Number(l.unitCost), po.currency)}</td>
            </tr>
          ))}
          <tr><td style={{ ...cell, fontWeight: 700 }} colSpan={4}>Total</td><td style={{ ...right, fontWeight: 700 }}>{money(po.total, po.currency)}</td></tr>
          {isOrgCopy && naira !== null && po.currency !== 'NGN' ? <tr><td style={{ ...cell, color: '#475569' }} colSpan={4}>In naira at ₦{Number(po.exchangeRate).toLocaleString('en-NG')} per {po.currency}</td><td style={{ ...right, color: '#475569' }}>₦{naira.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</td></tr> : null}
        </tbody>
      </table>
      {po.notes ? <p style={{ marginTop: '10px', fontSize: '11px', color: '#0F172A', whiteSpace: 'pre-line' }}><b>Notes:</b> {po.notes}</p> : null}
      <p style={{ marginTop: '12px', fontSize: '11px', color: '#475569' }}>Please quote the purchase order number on every invoice, packing list and shipping document. Goods are counted and inspected on receipt; shortages and defects are claimed back.</p>
      {isOrgCopy ? (
        <div style={{ marginTop: '14px', fontSize: '11px', color: '#475569' }}>
          <div style={{ fontWeight: 700 }}>APPROVAL</div>
          <div>Raised by {po.raisedBy.fullName} · {formatDateTime(po.createdAt)}</div>
          <div>Head of Procurement: {po.approvedBy ? `${po.approvedBy} · ${formatDateTime(po.approvedAt as Date)}` : 'pending'}</div>
          {po.sentAt ? <div>Sent to the supplier · {formatDateTime(po.sentAt)}</div> : null}
        </div>
      ) : null}
      <SignatureBlock issuerLabel="Approved By (Head of Procurement)" issuerName={po.approvedBy ?? ''} collectorLabel="Accepted By (Supplier)" collectorName="" />
      <DocumentFooter organisation={organisation} />
    </div>
  );
}
