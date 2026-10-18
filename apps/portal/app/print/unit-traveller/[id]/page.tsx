import { notFound } from 'next/navigation';
import { prisma } from '@ejo/database';
import { portalBaseUrl } from '@/lib/portal-url';
import { getUnit } from '@/lib/actions/production';
import { getOrganisation } from '@/lib/actions/organisation';
import { DocumentHeader, DocumentFooter, SignatureBlock } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { UNIT_STAGE_LABEL, type UnitStageCode } from '@/lib/production-core';
import { FAMILY_LABEL, type ProductFamilyCode } from '@/lib/catalogue-core';
import { formatDateTime } from '@/lib/utils/format-date';

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
const heading = { marginTop: '14px', fontSize: '11px', fontWeight: 700, color: '#475569' } as const;

/**
 * The unit traveller sheet: serial, configuration, components fitted, software,
 * every check with its result, and the station signatures. The Box Copy
 * (?variant=client) leaves out staff names and the rework history.
 */
export default async function PrintUnitTravellerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrgCopy = variant !== 'client';
  const [u, organisation] = await Promise.all([getUnit(id), getOrganisation()]);
  if (!u || !organisation) notFound();
  const branch = await prisma.branch.findUnique({ where: { id: u.branch.id } });
  if (!branch) notFound();
  const who = (name: string | null) => (isOrgCopy ? name ?? '—' : '');
  const specs = Object.entries((u.configuration?.specs ?? {}) as Record<string, string>);
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '28px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader
        organisation={organisation}
        branch={branch}
        divisionName="Production"
        logoUrl={`${portalBaseUrl()}/images/logo/logo.png`}
        documentTitle={isOrgCopy ? 'Unit Traveller — Production Copy' : 'Unit Traveller — Box Copy'}
        referenceNumber={u.serialNumber}
        statusLabel={UNIT_STAGE_LABEL[u.stage as UnitStageCode]}
        accentColor="#E10600"
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 18px', marginTop: '16px' }}>
        <Field label="SERIAL" value={u.serialNumber} />
        <Field label="TRAVELLER" value={u.number} />
        <Field label="BUILD ORDER" value={u.buildOrder?.number ?? '—'} />
        <Field label="PRODUCT" value={`${u.product.name} (${u.product.sku})`} />
        <Field label="CONFIGURATION" value={u.configuration ? `${u.configuration.name} (${u.product.sku}-${u.configuration.code})` : '—'} />
        <Field label="FAMILY" value={FAMILY_LABEL[u.product.family as ProductFamilyCode]} />
        <Field label="STARTED" value={formatDateTime(u.createdAt)} />
        <Field label="WARRANTY" value={`${u.product.defaultWarrantyMonths} months from sale`} />
        {u.finishedUnit ? <Field label="STORE" value={u.finishedUnit.location.name} /> : null}
      </div>
      {specs.length ? <div style={{ marginTop: '10px', fontSize: '11px', color: '#475569' }}>{specs.map(([k, v]) => `${k}: ${v}`).join(' · ')}</div> : null}
      {isOrgCopy && u.buildOrder?.instructions ? <div style={{ marginTop: '10px', fontSize: '11px' }}><b>Instructions:</b> {u.buildOrder.instructions}</div> : null}

      <div style={heading}>STATIONS</div>
      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '4px' }}>
        <thead><tr><th style={{ ...head, textAlign: 'left' }}>Station</th><th style={{ ...head, textAlign: 'left' }}>By</th><th style={{ ...head, textAlign: 'left' }}>When</th><th style={{ ...head, textAlign: 'left' }}>Result</th></tr></thead>
        <tbody>
          <tr><td style={cell}>Assembly</td><td style={cell}>{who(u.names.assembledBy)}</td><td style={cell}>{u.assembledAt ? formatDateTime(u.assembledAt) : ''}</td><td style={cell}>{u.assembledAt ? 'done' : ''}</td></tr>
          <tr><td style={cell}>Software image and packages</td><td style={cell}>{who(u.names.imagedBy)}</td><td style={cell}>{u.imagedAt ? formatDateTime(u.imagedAt) : ''}</td><td style={cell}>{u.imagedAt ? 'installed' : ''}</td></tr>
          <tr><td style={cell}>Line supervisor check</td><td style={cell}>{who(u.names.lineCheckedBy)}</td><td style={cell}>{u.lineCheckedAt ? formatDateTime(u.lineCheckedAt) : ''}</td><td style={cell}>{u.lineCheckPassed === null ? '' : u.lineCheckPassed ? 'PASS' : 'FAIL'}</td></tr>
          <tr><td style={cell}>QA test</td><td style={cell}>{who(u.names.qaBy)}</td><td style={cell}>{u.qaAt ? formatDateTime(u.qaAt) : ''}</td><td style={cell}>{u.qaPassed === null ? '' : `${u.qaPassed ? 'PASS' : 'FAIL'}${u.burnInHours !== null ? ` · burn-in ${u.burnInHours} h` : ''}`}</td></tr>
          <tr><td style={cell}>Packing</td><td style={cell}>{who(u.names.packedBy)}</td><td style={cell}>{u.packedAt ? formatDateTime(u.packedAt) : ''}</td><td style={cell}>{u.packedAt ? 'packed' : ''}</td></tr>
          <tr><td style={cell}>Released to finished goods</td><td style={cell}>{who(u.names.releasedBy)}</td><td style={cell}>{u.releasedAt ? formatDateTime(u.releasedAt) : ''}</td><td style={cell}>{u.releasedAt ? 'released' : ''}</td></tr>
        </tbody>
      </table>
      {isOrgCopy && u.reworkCount ? <div style={{ marginTop: '6px', fontSize: '11px', color: '#92400E' }}>Reworked {u.reworkCount} {u.reworkCount === 1 ? 'time' : 'times'}{u.reworkNotes ? ` — ${u.reworkNotes}` : ''}</div> : null}
      {u.scrapReason ? <div style={{ marginTop: '6px', fontSize: '11px', color: '#B91C1C' }}>Scrapped: {u.scrapReason}</div> : null}

      <div style={heading}>COMPONENTS</div>
      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '4px' }}>
        <thead><tr><th style={{ ...head, textAlign: 'left' }}>Part</th><th style={{ ...head, textAlign: 'left' }}>Serial / lot</th>{isOrgCopy ? <th style={{ ...head, textAlign: 'left' }}>Fitted by</th> : null}<th style={{ ...head, textAlign: 'left' }}>When</th></tr></thead>
        <tbody>
          {u.components.length === 0 ? <tr><td style={cell} colSpan={4}>No components recorded.</td></tr> : u.components.map((c) => (
            <tr key={c.id}><td style={cell}>{c.part.name}{c.part.partNumber ? ` (${c.part.partNumber})` : ''}</td><td style={cell}>{[c.serialNumber ? `SN ${c.serialNumber}` : null, c.lotNumber ? `lot ${c.lotNumber}` : null].filter(Boolean).join(' · ') || '—'}</td>{isOrgCopy ? <td style={cell}>{c.fittedByName ?? '—'}</td> : null}<td style={cell}>{formatDateTime(c.fittedAt)}</td></tr>
          ))}
        </tbody>
      </table>

      <div style={heading}>SOFTWARE</div>
      <div style={{ fontSize: '11px', marginTop: '4px' }}>
        {u.configuration?.packages.length ? u.configuration.packages.map((p) => `${p.package.name}${p.package.version ? ` ${p.package.version}` : ''}${p.required ? '' : ' (optional)'}`).join(' · ') : 'No software packages on this configuration.'}
        {u.imagedAt ? ` — installed ${formatDateTime(u.imagedAt)}` : ''}
      </div>

      {u.checks.length ? (
        <>
          <div style={heading}>CHECKS</div>
          <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '4px' }}>
            <thead><tr><th style={{ ...head, textAlign: 'left' }}>Stage</th><th style={{ ...head, textAlign: 'left' }}>Item</th><th style={{ ...head, textAlign: 'left' }}>Result</th>{isOrgCopy ? <th style={{ ...head, textAlign: 'left' }}>By</th> : null}<th style={{ ...head, textAlign: 'left' }}>When</th></tr></thead>
            <tbody>
              {u.checks.map((c) => (
                <tr key={c.id}><td style={cell}>{c.stage === 'QA' ? 'QA' : 'Line'}</td><td style={cell}>{c.item}{c.note ? ` — ${c.note}` : ''}</td><td style={{ ...cell, fontWeight: 700, color: c.result === 'FAIL' ? '#B91C1C' : c.result === 'PASS' ? '#15803D' : '#64748B' }}>{c.result === 'NA' ? 'N/A' : c.result}</td>{isOrgCopy ? <td style={cell}>{c.checkedByName ?? '—'}</td> : null}<td style={cell}>{formatDateTime(c.checkedAt)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <SignatureBlock issuerLabel="Line supervisor" issuerName={isOrgCopy ? u.names.lineCheckedBy : null} collectorLabel="QA inspector" collectorName={isOrgCopy ? u.names.qaBy : null} />
      <SignatureBlock issuerLabel="Packed by" issuerName={isOrgCopy ? u.names.packedBy : null} collectorLabel="Released by (Production Manager)" collectorName={isOrgCopy ? u.names.releasedBy : null} />
      <DocumentFooter organisation={organisation} />
    </div>
  );
}
