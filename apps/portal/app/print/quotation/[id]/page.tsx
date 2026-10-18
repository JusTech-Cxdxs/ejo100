import { portalBaseUrl } from '@/lib/portal-url';
import { notFound } from 'next/navigation';
import { prisma } from '@ejo/database';
import { getQuotation } from '@/lib/actions/sales';
import { getOrganisation } from '@/lib/actions/organisation';
import { DocumentHeader, SignatureBlock, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';
import { naira, QUOTATION_STATUS_LABEL, CHANNEL_LABEL, TIER_LABEL, type QuotationStatus } from '@/lib/sales-core';

const cell = { padding: '4px 6px', borderBottom: '1px solid #E2E8F0', fontSize: '11px', verticalAlign: 'top' } as const;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', marginTop: '1px' }}>{value}</div>
    </div>
  );
}

/**
 * The quotation as the customer receives it (?variant=client) or the
 * organisation copy with the approval chain. Read through the same fenced
 * reader as the record page; nothing outside this person's reach prints.
 */
export default async function PrintQuotationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrgCopy = variant !== 'client';
  const [q, organisation] = await Promise.all([getQuotation(id), getOrganisation()]);
  if (!q || !organisation) notFound();
  const branch = await prisma.branch.findUnique({ where: { id: q.branchId } });
  if (!branch) notFound();
  const tier = q.customer.dealerAccount?.channel === 'DEALER' ? q.customer.dealerAccount.tier : null;
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '28px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader organisation={organisation} branch={branch} logoUrl={`${portalBaseUrl()}/images/logo/logo.png`} documentTitle={isOrgCopy ? 'Quotation — Organisation Copy' : 'Quotation'} referenceNumber={q.number} statusLabel={QUOTATION_STATUS_LABEL[q.status as QuotationStatus] ?? q.status} accentColor="#E10600" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 18px', marginTop: '16px' }}>
        <Field label="CUSTOMER" value={q.customer.fullName} />
        <Field label="CONTACT" value={[q.customer.email, q.customer.phone].filter(Boolean).join(' · ') || '—'} />
        <Field label="ADDRESS" value={q.customer.address ?? '—'} />
        <Field label="CHANNEL" value={`${CHANNEL_LABEL[q.channel] ?? q.channel}${tier ? ` (${TIER_LABEL[tier]})` : ''}`} />
        <Field label="DATE" value={formatDateOnly(q.createdAt)} />
        <Field label="VALID UNTIL" value={q.validUntil ? formatDateOnly(q.validUntil) : '—'} />
        {isOrgCopy ? <Field label="PRICE LIST" value={q.priceList ? `${q.priceList.number} — ${q.priceList.name}` : 'None active'} /> : null}
        <Field label="PREPARED BY" value={q.preparedBy.fullName} />
      </div>
      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
        <thead><tr style={{ background: '#F8FAFC' }}><th style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>Product</th><th style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>Qty</th><th style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>Unit price</th><th style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>Discount</th><th style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>Amount</th></tr></thead>
        <tbody>
          {q.lines.map((l: (typeof q.lines)[number]) => (
            <tr key={l.id}><td style={cell}>{l.description}<div style={{ fontSize: '10px', color: '#64748B' }}>{l.product.sku}{l.configuration ? `-${l.configuration.code}` : ''}{l.notes ? ` · ${l.notes}` : ''}</div></td><td style={{ ...cell, textAlign: 'right' }}>{l.quantity}</td><td style={{ ...cell, textAlign: 'right' }}>{naira(Number(l.unitPrice))}</td><td style={{ ...cell, textAlign: 'right' }}>{Number(l.discountPercent)}%</td><td style={{ ...cell, textAlign: 'right' }}>{naira(Number(l.lineTotal))}</td></tr>
          ))}
          <tr><td colSpan={4} style={{ ...cell, textAlign: 'right' }}>Goods</td><td style={{ ...cell, textAlign: 'right' }}>{naira(Number(q.subtotal))}</td></tr>
          <tr><td colSpan={4} style={{ ...cell, textAlign: 'right' }}>Discount</td><td style={{ ...cell, textAlign: 'right' }}>- {naira(Number(q.discountTotal))}</td></tr>
          <tr><td colSpan={4} style={{ ...cell, textAlign: 'right' }}>VAT {Number(q.taxRatePercent)}%</td><td style={{ ...cell, textAlign: 'right' }}>{naira(Number(q.taxTotal))}</td></tr>
          <tr><td colSpan={4} style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>Total</td><td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{naira(Number(q.total))}</td></tr>
        </tbody>
      </table>
      {q.notes ? <div style={{ marginTop: '12px', fontSize: '11px', whiteSpace: 'pre-line' }}><div style={{ fontWeight: 700, color: '#475569' }}>NOTES</div>{q.notes}</div> : null}
      <p style={{ marginTop: '12px', fontSize: '11px', color: '#475569' }}>Prices are in Naira and include VAT at {Number(q.taxRatePercent)}%. Goods are released once payment is confirmed (or against approved credit terms). Serialised units carry the manufacturer&apos;s warranty from the day of delivery.</p>
      {isOrgCopy ? (
        <div style={{ marginTop: '12px', fontSize: '11px', color: '#475569' }}>
          <div style={{ fontWeight: 700 }}>APPROVAL CHAIN</div>
          <div>Prepared by {q.preparedBy.fullName} · {formatDateTime(q.createdAt)}</div>
          <div>Discount: {q.approval.needsApproval ? `${q.approval.maxLinePercent}% on a line, ${q.approval.overallPercent}% overall — ${q.approverName ? `approved by ${q.approverName}${q.discountApprovedAt ? ` · ${formatDateTime(q.discountApprovedAt)}` : ''}` : 'awaiting approval'}` : 'within the officer\'s limit'}</div>
          {q.sentAt ? <div>Sent {formatDateTime(q.sentAt)}</div> : null}
          {q.salesOrder ? <div>Sales order {q.salesOrder.number}</div> : null}
        </div>
      ) : null}
      <SignatureBlock issuerLabel="For the Company" issuerName={q.preparedBy.fullName} collectorLabel="Accepted By (Customer)" collectorName="" />
      <DocumentFooter organisation={organisation} />
    </div>
  );
}
