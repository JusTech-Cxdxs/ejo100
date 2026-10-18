import { portalBaseUrl } from '@/lib/portal-url';
import { notFound } from 'next/navigation';
import { prisma } from '@ejo/database';
import { getServiceJob } from '@/lib/actions/service';
import { getOrganisation } from '@/lib/actions/organisation';
import { DocumentHeader, SignatureBlock, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { SERVICE_JOB_STATUS_LABEL, SERVICE_KIND_LABEL, COST_CENTRE_LABEL, COVERAGE_LABEL, type ServiceJobStatus, type ServiceJobKind, type WarrantyCostCentre } from '@/lib/service-core';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';
import { formatCurrency } from '@ejo/utils';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', marginTop: '1px' }}>{value}</div>
    </div>
  );
}
function Section({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ marginTop: '10px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>{title}</div>
      <div style={{ fontSize: '12px', color: '#0F172A', whiteSpace: 'pre-line', lineHeight: 1.45 }}>{text || '—'}</div>
    </div>
  );
}

/**
 * The service job sheet: the unit, its cover, the fault, diagnosis, parts,
 * resolution and quality check. The Customer Copy (?variant=client) leaves out
 * the cost centre, the ledger and the part costs; the Organisation Copy adds them.
 */
export default async function PrintServiceJobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrgCopy = variant !== 'client';
  const [job, organisation] = await Promise.all([getServiceJob(id), getOrganisation()]);
  if (!job || !organisation) notFound();
  const branch = await prisma.branch.findUnique({ where: { id: job.branchId } });
  if (!branch) notFound();
  const cell = { padding: '3px 6px', borderBottom: '1px solid #E2E8F0', fontSize: '11px' } as const;
  const kind = job.kind as ServiceJobKind;
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '28px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader
        organisation={organisation}
        branch={branch}
        divisionName="Service Centre"
        logoUrl={`${portalBaseUrl()}/images/logo/logo.png`}
        documentTitle={isOrgCopy ? 'Service Job Sheet — Organisation Copy' : 'Service Job Sheet — Customer Copy'}
        referenceNumber={job.number}
        statusLabel={SERVICE_JOB_STATUS_LABEL[job.status as ServiceJobStatus] ?? job.status}
        accentColor="#E10600"
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 18px', marginTop: '16px' }}>
        <Field label="UNIT" value={job.productName} />
        <Field label="SERIAL" value={job.serialNumber} />
        <Field label="KIND" value={SERVICE_KIND_LABEL[kind]} />
        <Field label="CUSTOMER" value={job.customer?.fullName ?? '—'} />
        <Field label="PHONE" value={job.customer?.phone ?? '—'} />
        <Field label="RECEIVED" value={formatDateTime(job.createdAt)} />
        <Field label="WARRANTY TODAY" value={job.finishedUnit ? `${COVERAGE_LABEL[job.coverage.state]}${job.coverage.warranty ? ` (${job.coverage.warranty.warrantyNumber ?? ''} to ${formatDateOnly(new Date(job.coverage.warranty.endsAt))})` : ''}` : 'Serial not in the system'} />
        <Field label="TECHNICIAN" value={job.technicianName ?? 'Not assigned'} />
        <Field label="SUPERVISOR" value={job.supervisorName ?? job.openedBy.fullName} />
        {job.claim ? <Field label="WARRANTY CLAIM" value={job.claim.claimNumber} /> : null}
        {job.qaAt ? <Field label="QUALITY CHECK" value={`${job.qaPassed ? 'Passed' : 'Failed'} — ${job.qaByName ?? ''} ${formatDateOnly(job.qaAt)}`} /> : null}
        {job.returnedAt ? <Field label="RETURNED" value={formatDateTime(job.returnedAt)} /> : null}
      </div>

      <Section title="FAULT REPORTED" text={job.fault} />
      <Section title="DIAGNOSIS" text={job.diagnosis ?? ''} />
      <Section title="RESOLUTION" text={job.resolution ?? ''} />

      <div style={{ marginTop: '14px', fontSize: '11px', fontWeight: 700, color: '#475569' }}>PARTS USED</div>
      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '4px' }}>
        <tbody>
          {job.parts.length === 0 ? <tr><td style={cell}>No parts recorded.</td></tr> : job.parts.map((p) => (
            <tr key={p.id}><td style={cell}>{p.part.name}{p.part.partNumber ? ` (${p.part.partNumber})` : ''}</td><td style={{ ...cell, textAlign: 'right' }}>{p.quantity} {p.part.baseUnitOfMeasure}</td>{isOrgCopy ? <td style={{ ...cell, textAlign: 'right' }}>{formatCurrency(p.unitCost, 'NGN')}</td> : null}</tr>
          ))}
        </tbody>
      </table>

      {kind === 'PAID' ? (
        <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '14px', fontSize: '12px' }}>
          <tbody>
            <tr><td style={cell}>Quoted</td><td style={{ ...cell, textAlign: 'right' }}>{job.quotedAmount === null ? 'Not yet quoted' : formatCurrency(job.quotedAmount, 'NGN')}</td></tr>
            <tr><td style={cell}>Paid</td><td style={{ ...cell, textAlign: 'right' }}>{formatCurrency(job.paidAmount, 'NGN')}</td></tr>
            <tr><td style={{ ...cell, fontWeight: 700 }}>Balance</td><td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{formatCurrency(job.balance, 'NGN')}</td></tr>
          </tbody>
        </table>
      ) : null}

      {isOrgCopy ? (
        <div style={{ marginTop: '14px', fontSize: '11px', color: '#475569' }}>
          <div style={{ fontWeight: 700 }}>COST CENTRE AND LEDGER</div>
          <div>Cost centre: {job.costCentre ? COST_CENTRE_LABEL[job.costCentre as WarrantyCostCentre] : 'not decided yet'}</div>
          {job.ledger.map((l) => <div key={l.id}>{formatCurrency(l.amount, 'NGN')} — {COST_CENTRE_LABEL[l.costCentre as WarrantyCostCentre]}{l.note ? ` — ${l.note}` : ''} ({l.recordedByName ?? '—'}, {formatDateOnly(l.recordedAt)})</div>)}
          {job.parts.length ? <div>Parts value: {formatCurrency(job.partsTotal, 'NGN')}</div> : null}
        </div>
      ) : (
        <p style={{ marginTop: '14px', fontSize: '11px', color: '#475569' }}>Please bring this sheet and a form of identification when collecting the unit. Repairs under warranty carry the remaining warranty of the unit.</p>
      )}

      <SignatureBlock issuerLabel="Service Centre" issuerName={job.supervisorName ?? job.openedBy.fullName} collectorLabel="Customer / collected by" collectorName={job.customer?.fullName ?? null} />
      <DocumentFooter organisation={organisation} />
    </div>
  );
}
