import { portalBaseUrl } from '@/lib/portal-url';
import { notFound } from 'next/navigation';
import { prisma } from '@ejo/database';
import { getSalesOrder } from '@/lib/actions/sales';
import { getOrganisation } from '@/lib/actions/organisation';
import { bankDetailsFor } from '@/lib/workshop-core';
import { DocumentHeader, SignatureBlock, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { formatDateOnly } from '@/lib/utils/format-date';
import { naira, CHANNEL_LABEL } from '@/lib/sales-core';

const cell = { padding: '4px 6px', borderBottom: '1px solid #E2E8F0', fontSize: '11px', verticalAlign: 'top' } as const;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', marginTop: '1px' }}>{value}</div>
    </div>
  );
}

/** The pro-forma invoice: the order's lines, the amount to pay, where to pay it and by when. The id is the pro-forma's; it is read through its order's fenced reader. */
export default async function PrintProFormaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrgCopy = variant !== 'client';
  const pfi = await prisma.proFormaInvoice.findUnique({ where: { id }, select: { id: true, salesOrderId: true } });
  if (!pfi) notFound();
  const [o, organisation] = await Promise.all([getSalesOrder(pfi.salesOrderId), getOrganisation()]);
  if (!o || !organisation) notFound();
  const p = o.proFormas.find((x: (typeof o.proFormas)[number]) => x.id === pfi.id);
  if (!p) notFound();
  const [branch, bank] = await Promise.all([prisma.branch.findUnique({ where: { id: o.branchId } }), bankDetailsFor(o.branchId)]);
  if (!branch) notFound();
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '28px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader organisation={organisation} branch={branch} logoUrl={`${portalBaseUrl()}/images/logo/logo.png`} documentTitle={isOrgCopy ? 'Pro-forma Invoice — Organisation Copy' : 'Pro-forma Invoice'} referenceNumber={p.number} statusLabel={p.status === 'ISSUED' ? 'Awaiting payment' : p.status === 'PAID' ? 'Paid' : p.status === 'EXPIRED' ? 'Expired' : 'Cancelled'} accentColor="#E10600" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 18px', marginTop: '16px' }}>
        <Field label="CUSTOMER" value={o.customer.fullName} />
        <Field label="CONTACT" value={[o.customer.email, o.customer.phone].filter(Boolean).join(' · ') || '—'} />
        <Field label="DELIVER TO" value={o.deliveryAddress ?? o.customer.address ?? '—'} />
        <Field label="SALES ORDER" value={o.number} />
        <Field label="CHANNEL" value={CHANNEL_LABEL[o.channel] ?? o.channel} />
        <Field label="ISSUED" value={formatDateOnly(p.issuedAt)} />
        <Field label="PAY BY" value={p.dueDate ? formatDateOnly(p.dueDate) : '—'} />
        {o.customerReference ? <Field label="YOUR REFERENCE" value={o.customerReference} /> : null}
      </div>
      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
        <thead><tr style={{ background: '#F8FAFC' }}><th style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>Product</th><th style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>Qty</th><th style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>Unit price</th><th style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>Discount</th><th style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>Amount</th></tr></thead>
        <tbody>
          {o.lines.map((l: (typeof o.lines)[number]) => (
            <tr key={l.id}><td style={cell}>{l.description}<div style={{ fontSize: '10px', color: '#64748B' }}>{l.product.sku}{l.configuration ? `-${l.configuration.code}` : ''}</div></td><td style={{ ...cell, textAlign: 'right' }}>{l.quantity}</td><td style={{ ...cell, textAlign: 'right' }}>{naira(Number(l.unitPrice))}</td><td style={{ ...cell, textAlign: 'right' }}>{Number(l.discountPercent)}%</td><td style={{ ...cell, textAlign: 'right' }}>{naira(Number(l.lineTotal))}</td></tr>
          ))}
          <tr><td colSpan={4} style={{ ...cell, textAlign: 'right' }}>Goods</td><td style={{ ...cell, textAlign: 'right' }}>{naira(Number(o.subtotal))}</td></tr>
          <tr><td colSpan={4} style={{ ...cell, textAlign: 'right' }}>Discount</td><td style={{ ...cell, textAlign: 'right' }}>- {naira(Number(o.discountTotal))}</td></tr>
          <tr><td colSpan={4} style={{ ...cell, textAlign: 'right' }}>VAT 7.5%</td><td style={{ ...cell, textAlign: 'right' }}>{naira(Number(o.taxTotal))}</td></tr>
          <tr><td colSpan={4} style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>Amount to pay</td><td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{naira(Number(p.total))}</td></tr>
          {Number(o.amountPaid) > 0 ? <tr><td colSpan={4} style={{ ...cell, textAlign: 'right' }}>Paid so far (confirmed)</td><td style={{ ...cell, textAlign: 'right' }}>{naira(Number(o.amountPaid))}</td></tr> : null}
        </tbody>
      </table>
      <div style={{ marginTop: '14px', padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '11px' }}>
        <div style={{ fontWeight: 700, color: '#475569' }}>WHERE TO PAY</div>
        <div>Bank: {bank.bankName}</div><div>Account name: {bank.accountName}</div><div>Account number: {bank.accountNumber}</div><div>Reference: {p.number}</div>
      </div>
      {p.notes ? <p style={{ marginTop: '10px', fontSize: '11px', whiteSpace: 'pre-line' }}>{p.notes}</p> : null}
      <p style={{ marginTop: '12px', fontSize: '11px', color: '#475569' }}>This is a pro-forma invoice, not a tax invoice. Goods are released once Finance confirms the payment; the tax invoice follows delivery. Prices are valid until the pay-by date.</p>
      {isOrgCopy ? <div style={{ marginTop: '12px', fontSize: '11px', color: '#475569' }}>Issued by {o.names.get(p.issuedById) ?? '—'} · order confirmed by {o.confirmedBy.fullName} · terms {o.paymentTerms.toLowerCase()}</div> : null}
      <SignatureBlock issuerLabel="Issued By (Billing)" issuerName={isOrgCopy ? o.names.get(p.issuedById) ?? '' : ''} collectorLabel="Received By (Customer)" collectorName="" />
      <DocumentFooter organisation={organisation} />
    </div>
  );
}
