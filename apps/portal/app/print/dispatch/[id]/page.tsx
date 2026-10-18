import { portalBaseUrl } from '@/lib/portal-url';
import { notFound } from 'next/navigation';
import { prisma } from '@ejo/database';
import { getDispatch } from '@/lib/actions/warehouse';
import { getOrganisation } from '@/lib/actions/organisation';
import { DocumentHeader, SignatureBlock, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { DISPATCH_STATUS_LABEL, type DispatchStatus } from '@/lib/warehouse-core';
import { formatDateTime } from '@/lib/utils/format-date';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', marginTop: '1px', whiteSpace: 'pre-line' }}>{value}</div>
    </div>
  );
}

/**
 * Dispatch / delivery note: what left, with whom, for whom — and the
 * customer's signature on arrival. The customer copy (?variant=client)
 * leaves out the dispatcher's name.
 */
export default async function PrintDispatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrgCopy = variant !== 'client';
  const [d, organisation] = await Promise.all([getDispatch(id), getOrganisation()]);
  if (!d || !organisation) notFound();
  const branch = await prisma.branch.findUnique({ where: { id: d.salesOrder.branchId } });
  if (!branch) notFound();
  const cell = { padding: '4px 6px', borderBottom: '1px solid #E2E8F0', fontSize: '11px', verticalAlign: 'top' } as const;
  const head = { ...cell, fontSize: '10px', color: '#475569', fontWeight: 700, textAlign: 'left' } as const;
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '28px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader
        organisation={organisation}
        branch={branch}
        logoUrl={`${portalBaseUrl()}/images/logo/logo.png`}
        documentTitle={isOrgCopy ? 'Delivery Note — Warehouse Copy' : 'Delivery Note'}
        referenceNumber={d.number}
        statusLabel={DISPATCH_STATUS_LABEL[d.status as DispatchStatus]}
        accentColor="#E10600"
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 18px', marginTop: '16px' }}>
        <Field label="CUSTOMER" value={`${d.salesOrder.customer.fullName}${d.salesOrder.customer.phone ? `\n${d.salesOrder.customer.phone}` : ''}`} />
        <Field label="DELIVER TO" value={d.salesOrder.deliveryAddress ?? 'Collection'} />
        <Field label="SALES ORDER · RELEASE NOTE" value={`${d.salesOrder.number} · ${d.releaseNote.number}`} />
        <Field label="VEHICLE" value={d.vehiclePlate ?? '—'} />
        <Field label="DRIVER" value={[d.driverName, d.driverPhone].filter(Boolean).join(' · ') || '—'} />
        <Field label="CARRIER · WAYBILL" value={[d.carrier, d.waybill].filter(Boolean).join(' · ') || '—'} />
        <Field label="DISPATCHED" value={`${formatDateTime(d.dispatchedAt)}${isOrgCopy && d.dispatchedBy ? ` · ${d.dispatchedBy}` : ''}`} />
        <Field label="CUSTOMER REFERENCE" value={d.salesOrder.customerReference ?? '—'} />
        {d.deliveredAt ? <Field label="DELIVERED" value={`${formatDateTime(d.deliveredAt)}${d.receivedByName ? ` · ${d.receivedByName}` : ''}`} /> : null}
      </div>

      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
        <thead><tr><th style={head}>#</th><th style={head}>Product</th><th style={head}>Configuration</th><th style={head}>Serial</th><th style={head}>✓</th></tr></thead>
        <tbody>
          {d.units.map((u, i) => (
            <tr key={u.id}>
              <td style={cell}>{i + 1}</td>
              <td style={cell}>{u.product.name}<div style={{ fontSize: '10px', color: '#64748B' }}>{u.product.sku}</div></td>
              <td style={cell}>{u.configuration?.name ?? 'Standard'}</td>
              <td style={{ ...cell, fontFamily: 'Consolas, Menlo, monospace' }}>{u.serialNumber}</td>
              <td style={{ ...cell, width: '24px' }}>☐</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: '10px', fontSize: '11px', color: '#475569' }}>{d.units.length} {d.units.length === 1 ? 'unit' : 'units'}.{d.deliveryNotes ? ` ${d.deliveryNotes}` : ''}</p>
      <p style={{ marginTop: '12px', fontSize: '11px', color: '#475569' }}>Received the goods listed above in good condition, serial numbers checked. Warranty runs from the delivery date; keep this note with the invoice.</p>
      <SignatureBlock issuerLabel="Dispatched By (Warehouse)" issuerName={isOrgCopy ? d.dispatchedBy ?? '' : ''} collectorLabel="Received By (Customer) — name, date, signature" collectorName={d.receivedByName ?? ''} />
      <DocumentFooter organisation={organisation} />
    </div>
  );
}
