import { portalBaseUrl } from '@/lib/portal-url';
import { notFound } from 'next/navigation';
import { prisma } from '@ejo/database';
import { getRelease } from '@/lib/actions/warehouse';
import { getOrganisation } from '@/lib/actions/organisation';
import { DocumentHeader, SignatureBlock, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { RELEASE_STATUS_LABEL, type ReleaseStatus } from '@/lib/warehouse-core';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', marginTop: '1px' }}>{value}</div>
    </div>
  );
}

/**
 * Goods release note — the pick list: every line with its serial, who picked
 * and released it, and the signatures. The customer copy (?variant=client)
 * leaves out internal names and locations.
 */
export default async function PrintReleaseNotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrgCopy = variant !== 'client';
  const [r, organisation] = await Promise.all([getRelease(id), getOrganisation()]);
  if (!r || !organisation) notFound();
  const branch = await prisma.branch.findUnique({ where: { id: r.salesOrder.branchId } });
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
        documentTitle={isOrgCopy ? 'Goods Release Note — Warehouse Copy' : 'Goods Release Note'}
        referenceNumber={r.number}
        statusLabel={RELEASE_STATUS_LABEL[r.status as ReleaseStatus]}
        accentColor="#E10600"
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 18px', marginTop: '16px' }}>
        <Field label="CUSTOMER" value={r.salesOrder.customer.fullName} />
        <Field label="SALES ORDER" value={r.salesOrder.number} />
        <Field label="CHANNEL" value={r.salesOrder.channel.toLowerCase().replace(/^./, (c) => c.toUpperCase())} />
        <Field label="DELIVER TO" value={r.salesOrder.deliveryAddress ?? 'Collection'} />
        <Field label="CUSTOMER REFERENCE" value={r.salesOrder.customerReference ?? '—'} />
        <Field label="ISSUED" value={formatDateTime(r.issuedAt)} />
        {isOrgCopy ? <Field label="CLEARED BY (FINANCE)" value={r.clearedBy ?? '—'} /> : null}
        {isOrgCopy ? <Field label="PICKED BY" value={r.pickedBy ? `${r.pickedBy} · ${formatDateOnly(r.pickedAt as Date)}` : 'Not yet'} /> : null}
        {isOrgCopy ? <Field label="RELEASED BY" value={r.releasedBy ? `${r.releasedBy} · ${formatDateOnly(r.releasedAt as Date)}` : 'Not yet'} /> : null}
      </div>

      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
        <thead>
          <tr><th style={head}>#</th><th style={head}>Product</th><th style={head}>Configuration</th><th style={head}>Qty</th><th style={head}>Serial</th>{isOrgCopy ? <th style={head}>Location</th> : null}<th style={head}>✓</th></tr>
        </thead>
        <tbody>
          {r.lines.map((l, i) => (
            <tr key={l.id}>
              <td style={cell}>{i + 1}</td>
              <td style={cell}>{l.salesOrderLine.product.name}<div style={{ fontSize: '10px', color: '#64748B' }}>{l.salesOrderLine.product.sku}</div></td>
              <td style={cell}>{l.salesOrderLine.configuration?.name ?? 'Standard'}</td>
              <td style={cell}>{l.salesOrderLine.product.serialised ? 1 : l.quantity}</td>
              <td style={{ ...cell, fontFamily: 'Consolas, Menlo, monospace' }}>{l.finishedUnit?.serialNumber ?? (l.salesOrderLine.product.serialised ? '____________________' : 'by quantity')}</td>
              {isOrgCopy ? <td style={cell}>{l.finishedUnit?.location.name ?? '—'}</td> : null}
              <td style={{ ...cell, width: '24px' }}>☐</td>
            </tr>
          ))}
        </tbody>
      </table>
      {r.notes ? <p style={{ marginTop: '10px', fontSize: '11px', color: '#475569' }}>Notes: {r.notes}</p> : null}
      <p style={{ marginTop: '12px', fontSize: '11px', color: '#475569' }}>
        {isOrgCopy ? 'Pick the serials listed, check each box, and hand the goods to dispatch with this note. The gate releases the vehicle against the dispatch number.' : 'Please check the serial numbers against the units received and sign below. Warranty runs from the delivery date.'}
      </p>
      <SignatureBlock issuerLabel="Released By (Warehouse)" issuerName={isOrgCopy ? r.releasedBy ?? '' : ''} collectorLabel={isOrgCopy ? 'Received By (Dispatch)' : 'Received By (Customer)'} collectorName="" />
      <DocumentFooter organisation={organisation} />
    </div>
  );
}
