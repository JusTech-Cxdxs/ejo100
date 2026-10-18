import { notFound } from 'next/navigation';
import { prisma } from '@ejo/database';
import { portalBaseUrl } from '@/lib/portal-url';
import { getBuildOrder } from '@/lib/actions/production';
import { getOrganisation } from '@/lib/actions/organisation';
import { DocumentHeader, DocumentFooter, SignatureBlock } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { BUILD_STATUS_LABEL, type BuildOrderStatusCode } from '@/lib/production-core';
import { STATION_LABEL, type Station } from '@/lib/catalogue-core';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', marginTop: '1px' }}>{value}</div>
    </div>
  );
}

const cell = { padding: '3px 6px', borderBottom: '1px solid #E2E8F0', fontSize: '11px', verticalAlign: 'top' } as const;
const head = { ...cell, fontWeight: 700, color: '#475569', borderBottom: '1px solid #CBD5E1' } as const;

/**
 * The build order's pick list: the bill of materials × quantity, what was
 * issued and what is still outstanding, for the parts warehouse and the line.
 * The Line Copy (?variant=client) leaves out stock figures.
 */
export default async function PrintBuildOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrgCopy = variant !== 'client';
  const [b, organisation] = await Promise.all([getBuildOrder(id), getOrganisation()]);
  if (!b || !organisation) notFound();
  const branch = await prisma.branch.findUnique({ where: { id: b.branch.id } });
  if (!branch) notFound();
  const stationOf = new Map(b.configuration.bomLines.map((l) => [l.partId, l.station]));
  const unitOf = new Map(b.configuration.bomLines.map((l) => [l.partId, l.part.baseUnitOfMeasure]));
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '28px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader
        organisation={organisation}
        branch={branch}
        divisionName="Production"
        logoUrl={`${portalBaseUrl()}/images/logo/logo.png`}
        documentTitle={isOrgCopy ? 'Build Order Pick List — Warehouse Copy' : 'Build Order — Line Copy'}
        referenceNumber={b.number}
        statusLabel={BUILD_STATUS_LABEL[b.status as BuildOrderStatusCode]}
        accentColor="#E10600"
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 18px', marginTop: '16px' }}>
        <Field label="PRODUCT" value={`${b.configuration.product.name} (${b.configuration.product.sku})`} />
        <Field label="CONFIGURATION" value={`${b.configuration.name} (${b.configuration.product.sku}-${b.configuration.code})`} />
        <Field label="QUANTITY" value={`${b.quantity} units`} />
        <Field label="PURPOSE" value={b.purpose === 'TO_STOCK' ? 'To stock' : `For an order${b.salesOrder ? ` — ${b.salesOrder.number}` : ''}`} />
        <Field label="DUE" value={b.dueDate ? formatDateOnly(b.dueDate) : 'Not set'} />
        <Field label="PRIORITY" value={String(b.priority)} />
        <Field label="PLANNED BY" value={`${b.plannedBy.fullName} · ${formatDateTime(b.createdAt)}`} />
        <Field label="RELEASED" value={b.releasedAt ? `${b.names.releasedBy ?? ''} · ${formatDateTime(b.releasedAt)}` : 'Not yet'} />
        <Field label="UNITS" value={`${b.counts.started} started · ${b.counts.released} released`} />
      </div>
      {b.instructions ? <div style={{ marginTop: '10px', fontSize: '11px' }}><b>Instructions for the line:</b> {b.instructions}</div> : null}

      <div style={{ marginTop: '14px', fontSize: '11px', fontWeight: 700, color: '#475569' }}>PICK LIST — BILL OF MATERIALS × {b.quantity}</div>
      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '4px' }}>
        <thead>
          <tr>
            <th style={{ ...head, textAlign: 'left' }}>Part</th>
            <th style={{ ...head, textAlign: 'left' }}>Station</th>
            <th style={{ ...head, textAlign: 'right' }}>Per unit</th>
            <th style={{ ...head, textAlign: 'right' }}>Required</th>
            <th style={{ ...head, textAlign: 'right' }}>Issued</th>
            <th style={{ ...head, textAlign: 'right' }}>Outstanding</th>
            {isOrgCopy ? <th style={{ ...head, textAlign: 'right' }}>Available</th> : null}
            <th style={{ ...head, textAlign: 'left' }}>Picked</th>
          </tr>
        </thead>
        <tbody>
          {b.availability.lines.length === 0 ? <tr><td style={cell} colSpan={8}>This configuration has no bill of materials.</td></tr> : b.availability.lines.map((l) => (
            <tr key={l.partId}>
              <td style={cell}>{l.name}{l.isOptional ? ' (optional)' : ''}</td>
              <td style={cell}>{STATION_LABEL[(stationOf.get(l.partId) ?? 'ASSEMBLY') as Station] ?? stationOf.get(l.partId)}</td>
              <td style={{ ...cell, textAlign: 'right' }}>{l.perUnit} {unitOf.get(l.partId) ?? ''}</td>
              <td style={{ ...cell, textAlign: 'right' }}>{l.required}</td>
              <td style={{ ...cell, textAlign: 'right' }}>{l.issued}</td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{l.outstanding}</td>
              {isOrgCopy ? <td style={{ ...cell, textAlign: 'right', color: l.shortage > 0 && !l.isOptional ? '#B91C1C' : '#0F172A' }}>{Math.max(0, l.available)}{l.shortage > 0 && !l.isOptional ? ` (short ${l.shortage})` : ''}</td> : null}
              <td style={cell}>☐</td>
            </tr>
          ))}
        </tbody>
      </table>
      {isOrgCopy && b.shortageNote ? <div style={{ marginTop: '6px', fontSize: '11px', color: '#92400E' }}>Shortages at the last check: {b.shortageNote}</div> : null}

      {b.materialIssues.length ? (
        <>
          <div style={{ marginTop: '14px', fontSize: '11px', fontWeight: 700, color: '#475569' }}>ISSUED TO THE LINE</div>
          <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '4px' }}>
            <tbody>
              {b.materialIssues.map((m) => (
                <tr key={m.id}><td style={cell}>{m.part.name}{m.part.partNumber ? ` (${m.part.partNumber})` : ''}</td><td style={{ ...cell, textAlign: 'right' }}>{m.quantity} {m.part.baseUnitOfMeasure}</td><td style={cell}>{m.lotOrSerials ?? ''}</td><td style={cell}>{isOrgCopy ? m.issuedByName ?? '' : ''} · {formatDateTime(m.issuedAt)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {b.configuration.packages.length ? <div style={{ marginTop: '10px', fontSize: '11px' }}><b>Software per unit:</b> {b.configuration.packages.map((p) => `${p.package.name}${p.package.version ? ` ${p.package.version}` : ''}`).join(' · ')}</div> : null}

      <SignatureBlock issuerLabel="Issued by (parts warehouse)" issuerName={null} collectorLabel="Received by (line supervisor)" collectorName={null} />
      <DocumentFooter organisation={organisation} />
    </div>
  );
}
