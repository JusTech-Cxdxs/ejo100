import { portalBaseUrl } from '@/lib/portal-url';
import { notFound } from 'next/navigation';
import { prisma } from '@ejo/database';
import { getSalesOrder } from '@/lib/actions/sales';
import { getOrganisation } from '@/lib/actions/organisation';
import { DocumentHeader, SignatureBlock, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { formatDateOnly } from '@/lib/utils/format-date';
import { naira, CHANNEL_LABEL, PAYMENT_TERMS_LABEL, type PaymentTerms } from '@/lib/sales-core';

const cell = { padding: '4px 6px', borderBottom: '1px solid #E2E8F0', fontSize: '11px', verticalAlign: 'top' } as const;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', marginTop: '1px' }}>{value}</div>
    </div>
  );
}

/** The tax invoice for delivered goods (the id is the invoice's; read through its order's fenced reader). Serials delivered are listed when known. */
export default async function PrintInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrgCopy = variant !== 'client';
  const inv = await prisma.salesInvoice.findUnique({ where: { id }, select: { id: true, salesOrderId: true } });
  if (!inv) notFound();
  const [o, organisation] = await Promise.all([getSalesOrder(inv.salesOrderId), getOrganisation()]);
  if (!o || !organisation) notFound();
  const i = o.invoices.find((x: (typeof o.invoices)[number]) => x.id === inv.id);
  if (!i) notFound();
  const branch = await prisma.branch.findUnique({ where: { id: o.branchId } });
  if (!branch) notFound();
  const delivered = o.dispatches.find((d: (typeof o.dispatches)[number]) => d.deliveredAt) ?? null;
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '28px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader organisation={organisation} branch={branch} logoUrl={`${portalBaseUrl()}/images/logo/logo.png`} documentTitle={isOrgCopy ? 'Tax Invoice — Organisation Copy' : 'Tax Invoice'} referenceNumber={i.number} statusLabel={i.status === 'ISSUED' ? 'Issued' : i.status === 'EXPORTED' ? 'Exported to finance' : 'Cancelled'} accentColor="#E10600" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 18px', marginTop: '16px' }}>
        <Field label="BILL TO" value={o.customer.fullName} />
        <Field label="CONTACT" value={[o.customer.email, o.customer.phone].filter(Boolean).join(' · ') || '—'} />
        <Field label="DELIVERED TO" value={o.deliveryAddress ?? o.customer.address ?? '—'} />
        <Field label="SALES ORDER" value={o.number} />
        <Field label="INVOICE DATE" value={formatDateOnly(i.issuedAt)} />
        <Field label="DELIVERED" value={delivered?.deliveredAt ? `${formatDateOnly(delivered.deliveredAt)} (${delivered.number})` : '—'} />
        <Field label="CHANNEL · TERMS" value={`${CHANNEL_LABEL[o.channel] ?? o.channel} · ${PAYMENT_TERMS_LABEL[o.paymentTerms as PaymentTerms]}`} />
        {o.customerReference ? <Field label="YOUR REFERENCE" value={o.customerReference} /> : null}
        {organisation.rcNumber ? <Field label="RC NUMBER" value={organisation.rcNumber} /> : null}
      </div>
      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
        <thead><tr style={{ background: '#F8FAFC' }}><th style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>Product</th><th style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>Qty</th><th style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>Unit price</th><th style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>Discount</th><th style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>Amount</th></tr></thead>
        <tbody>
          {o.lines.map((l: (typeof o.lines)[number]) => (
            <tr key={l.id}><td style={cell}>{l.description}<div style={{ fontSize: '10px', color: '#64748B' }}>{l.product.sku}{l.configuration ? `-${l.configuration.code}` : ''}</div></td><td style={{ ...cell, textAlign: 'right' }}>{l.quantity}</td><td style={{ ...cell, textAlign: 'right' }}>{naira(Number(l.unitPrice))}</td><td style={{ ...cell, textAlign: 'right' }}>{Number(l.discountPercent)}%</td><td style={{ ...cell, textAlign: 'right' }}>{naira(Number(l.lineTotal))}</td></tr>
          ))}
          <tr><td colSpan={4} style={{ ...cell, textAlign: 'right' }}>Net of discount</td><td style={{ ...cell, textAlign: 'right' }}>{naira(Number(i.subtotal))}</td></tr>
          <tr><td colSpan={4} style={{ ...cell, textAlign: 'right' }}>VAT 7.5%</td><td style={{ ...cell, textAlign: 'right' }}>{naira(Number(i.taxTotal))}</td></tr>
          <tr><td colSpan={4} style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>Total</td><td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{naira(Number(i.total))}</td></tr>
          <tr><td colSpan={4} style={{ ...cell, textAlign: 'right' }}>Paid (confirmed)</td><td style={{ ...cell, textAlign: 'right' }}>{naira(Number(o.amountPaid))}</td></tr>
          <tr><td colSpan={4} style={{ ...cell, textAlign: 'right' }}>Balance due</td><td style={{ ...cell, textAlign: 'right' }}>{naira(Math.max(0, Number(i.total) - Number(o.amountPaid)))}</td></tr>
        </tbody>
      </table>
      {o.units.length ? <div style={{ marginTop: '12px', fontSize: '11px' }}><div style={{ fontWeight: 700, color: '#475569' }}>SERIALS DELIVERED</div>{o.units.map((u: (typeof o.units)[number]) => `${u.serialNumber} (${u.product.name})`).join(', ')}</div> : null}
      <p style={{ marginTop: '12px', fontSize: '11px', color: '#475569' }}>VAT at 7.5% is included. The warranty on each serial runs from the delivery date above. {i.exportReference ? `Finance system reference: ${i.exportReference}.` : ''}</p>
      {isOrgCopy ? <div style={{ marginTop: '10px', fontSize: '11px', color: '#475569' }}>Issued by {o.names.get(i.issuedById) ?? '—'} · cleared by {o.clearedById ? o.names.get(o.clearedById) ?? '—' : '—'} · confirmed by {o.confirmedBy.fullName}</div> : null}
      <SignatureBlock issuerLabel="Issued By (Billing)" issuerName={isOrgCopy ? o.names.get(i.issuedById) ?? '' : ''} collectorLabel="Received By (Customer)" collectorName="" />
      <DocumentFooter organisation={organisation} />
    </div>
  );
}
