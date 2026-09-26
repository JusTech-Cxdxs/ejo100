import { notFound } from 'next/navigation';
import { prisma } from '@ejo/database';
import { getWarrantyClaim } from '@/lib/actions/warranty-claims';
import { getOrganisation } from '@/lib/actions/organisation';
import { getWorkshopBranchId } from '@/lib/actions/workshop';
import { DocumentHeader, SignatureBlock, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { CLAIM_STATUS_LABEL, REMEDY_LABEL, PART_RETURN_LABEL } from '@/lib/warranty-claim-status';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';

function naira(n: number): string {
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
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
 * Warranty claim pack — everything a provider needs to assess the claim:
 * eligibility (warranty, dates, km), the 3 C's, the causal part, the money,
 * and the vehicle's maintenance history. Provider Copy (?variant=client)
 * omits internal approval names; the Organisation Copy adds them.
 */
export default async function PrintWarrantyClaimPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrgCopy = variant !== 'client';
  const [c, organisation] = await Promise.all([getWarrantyClaim(id), getOrganisation()]);
  if (!c || !organisation) notFound();
  const branch = await prisma.branch.findUnique({ where: { id: await getWorkshopBranchId() } });
  if (!branch) notFound();
  const w = c.warranty;
  const distanceEnd = w.startReading !== null && w.distanceLimit !== null ? w.startReading + w.distanceLimit : null;
  const vehicle = c.vehicle ? [c.vehicle.year, c.vehicle.make, c.vehicle.model].filter(Boolean).join(' ') || 'Vehicle' : '—';
  const cell = { padding: '3px 6px', borderBottom: '1px solid #E2E8F0', fontSize: '11px' } as const;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '28px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader
        organisation={organisation}
        branch={branch}
        logoUrl={`${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app'}/images/logo/logo.png`}
        documentTitle={isOrgCopy ? 'Warranty Claim — Organisation Copy' : `Warranty Claim — ${c.provider.name}`}
        referenceNumber={c.claimNumber}
        statusLabel={CLAIM_STATUS_LABEL[c.status] ?? c.status}
        accentColor="#2563EB"
      />
      {w.policy.isSample ? <p style={{ marginTop: '10px', fontSize: '11px', color: '#92400E' }}>Sample warranty terms — demonstration only.</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 18px', marginTop: '16px' }}>
        <Field label="PROVIDER" value={c.provider.name} />
        <Field label="PROVIDER REFERENCE" value={c.providerReference ?? 'Not yet submitted'} />
        <Field label="WARRANTY" value={`${w.warrantyNumber} — ${w.policy.name}`} />
        <Field label="CUSTOMER" value={c.customer.fullName} />
        <Field label="VEHICLE" value={`${vehicle}${c.vehicle?.plateNumber ? ` — ${c.vehicle.plateNumber}` : ''}`} />
        <Field label="VIN" value={c.vehicle?.chassisNumber ?? '—'} />
        <Field label="COVERAGE" value={`${formatDateOnly(w.startsAt)} – ${formatDateOnly(w.endsAt)}${distanceEnd !== null ? ` or ${distanceEnd.toLocaleString('en-NG')} km` : ''}`} />
        <Field label="FAILURE" value={`${formatDateOnly(c.failureDate)}${c.failureReading !== null ? ` at ${c.failureReading.toLocaleString('en-NG')} km` : ''}`} />
        <Field label="REPAIR RECORD" value={c.jobCard ? `Job Card ${c.jobCard.jobNumber}` : c.vehicleService ? `Vehicle Service ${c.vehicleService.serviceNumber}` : '—'} />
        <Field label="CAUSAL PART" value={`${c.causalPart}${c.causalPartNumber ? ` (${c.causalPartNumber})` : ''}`} />
        {w.partSerial ? <Field label="SERIAL (WARRANTED PART)" value={w.partSerial.serialNumber} /> : null}
        {c.resubmissionCount > 0 ? <Field label="RESUBMISSION" value={String(c.resubmissionCount)} /> : null}
        <Field label="REMEDY REQUESTED" value={REMEDY_LABEL[c.remedy] ?? c.remedy} />
        <Field label="FAILED PART" value={c.partReturnRequired ? `${PART_RETURN_LABEL[c.partReturnStatus ?? 'AWAITING']}${c.partSentReference ? ` (ref ${c.partSentReference})` : ''}` : 'Retained here'} />
        {c.replacementSerial ? <Field label="REPLACEMENT SERIAL" value={c.replacementSerial} /> : null}
      </div>

      <Section title="COMPLAINT" text={c.complaint} />
      <Section title="CAUSE" text={c.cause} />
      <Section title="CORRECTION" text={c.correction} />

      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '14px', fontSize: '12px' }}>
        <tbody>
          <tr><td style={cell}>Labour</td><td style={{ ...cell, textAlign: 'right' }}>{naira(Number(c.labourAmount))}</td></tr>
          <tr><td style={cell}>Parts</td><td style={{ ...cell, textAlign: 'right' }}>{naira(Number(c.partsAmount))}</td></tr>
          <tr><td style={cell}>Other (incl. fluids)</td><td style={{ ...cell, textAlign: 'right' }}>{naira(Number(c.otherAmount))}</td></tr>
          <tr><td style={{ ...cell, fontWeight: 700 }}>Total claimed</td><td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{naira(Number(c.claimedAmount))}</td></tr>
          {c.approvedAmount !== null ? <tr><td style={cell}>Approved by the provider</td><td style={{ ...cell, textAlign: 'right' }}>{naira(Number(c.approvedAmount))}</td></tr> : null}
          {c.settledAmount !== null ? <tr><td style={cell}>Received</td><td style={{ ...cell, textAlign: 'right' }}>{naira(Number(c.settledAmount))}</td></tr> : null}
        </tbody>
      </table>

      <div style={{ marginTop: '14px', fontSize: '11px', fontWeight: 700, color: '#475569' }}>MAINTENANCE HISTORY</div>
      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '4px' }}>
        <tbody>
          {c.serviceHistory.length === 0 ? (
            <tr><td style={cell}>No completed services recorded.</td></tr>
          ) : (
            c.serviceHistory.map((s: (typeof c.serviceHistory)[number]) => (
              <tr key={s.id}><td style={cell}>{s.serviceNumber}</td><td style={cell}>{formatDateOnly(s.completedAt ?? s.createdAt)}</td><td style={{ ...cell, textAlign: 'right' }}>{s.odometerAtService !== null ? `${s.odometerAtService.toLocaleString('en-NG')} km` : '—'}</td></tr>
            ))
          )}
        </tbody>
      </table>

      {isOrgCopy ? (
        <div style={{ marginTop: '14px', fontSize: '11px', color: '#475569' }}>
          <div style={{ fontWeight: 700 }}>APPROVAL CHAIN</div>
          <div>Drafted by {c.createdBy.fullName} · {formatDateTime(c.createdAt)}</div>
          <div>Warranty HOD: {c.hodApprovedBy ? `${c.hodApprovedBy.fullName} · ${formatDateTime(c.hodApprovedAt as Date)}` : 'pending'}</div>
          <div>Branch Manager: {c.managerApprovedBy ? `${c.managerApprovedBy.fullName} · ${formatDateTime(c.managerApprovedAt as Date)}` : 'pending'}</div>
          {c.submittedBy ? <div>Submitted by {c.submittedBy.fullName} · {formatDateTime(c.submittedAt as Date)}</div> : null}
          <div>Readiness at print: {c.readiness.score}% ({c.readiness.blockers} blocking, {c.readiness.warnings} warnings)</div>
        </div>
      ) : null}
      <p style={{ marginTop: '12px', fontSize: '11px', color: '#475569' }}>
        We confirm the information above is accurate and that the failed part is retained for inspection
        {c.provider.partRetentionDays ? ` for ${c.provider.partRetentionDays} days from submission` : ''}.
      </p>
      <SignatureBlock issuerLabel="Submitted By (Warranty)" issuerName={isOrgCopy ? c.submittedBy?.fullName ?? '' : ''} collectorLabel="Received By (Provider)" collectorName="" />
      <DocumentFooter organisation={organisation} />
    </div>
  );
}
