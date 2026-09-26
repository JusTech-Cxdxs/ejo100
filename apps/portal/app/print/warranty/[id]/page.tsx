import { notFound } from 'next/navigation';
import { prisma } from '@ejo/database';
import { getWorkshopBranchId } from '@/lib/actions/workshop';
import { getWarranty } from '@/lib/actions/warranty';
import { getOrganisation } from '@/lib/actions/organisation';
import { DocumentHeader, SignatureBlock, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { warrantyCoverage, WARRANTY_STATE_LABEL } from '@/lib/warranty-state';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '1px' }}>{value}</div>
    </div>
  );
}

function Block({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '2px' }}>{title}</div>
      <div style={{ fontSize: '12px', color: '#0F172A', lineHeight: 1.45 }}>{text}</div>
    </div>
  );
}

/**
 * Warranty certificate — Organisation Copy by default, Customer Copy with
 * ?variant=client. The customer copy carries no staff names; the
 * organisation copy adds who issued / verified it and the evidence.
 */
export default async function PrintWarrantyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrgCopy = variant !== 'client';
  const [w, organisation] = await Promise.all([getWarranty(id), getOrganisation()]);
  if (!w || !organisation) notFound();
  const cov = warrantyCoverage(w, w.vehicle?.mileage ?? null);
  // The issuing branch: the Job Card's / Vehicle Service's own branch, or
  // the workshop branch for a manually registered vehicle warranty.
  const branch = w.jobCard?.branch ?? w.vehicleService?.branch ?? (await prisma.branch.findUnique({ where: { id: await getWorkshopBranchId() } }));
  if (!branch) notFound();
  const distanceEnd = w.startReading !== null && w.distanceLimit !== null ? w.startReading + w.distanceLimit : null;
  const vehicle = w.vehicle ? [w.vehicle.year, w.vehicle.make, w.vehicle.model].filter(Boolean).join(' ') || 'Vehicle' : null;
  const refs = [w.jobCard ? `Job Card ${w.jobCard.jobNumber}` : null, w.vehicleService ? `Vehicle Service ${w.vehicleService.serviceNumber}` : null, w.slipLine ? w.slipLine.slip.referenceNumber : null].filter(Boolean).join(' · ');

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '32px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader
        organisation={organisation}
        branch={branch}
        logoUrl={`${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app'}/images/logo/logo.png`}
        documentTitle={isOrgCopy ? 'Warranty Certificate — Organisation Copy' : 'Warranty Certificate'}
        referenceNumber={w.warrantyNumber}
        statusLabel={WARRANTY_STATE_LABEL[cov.state]}
        accentColor="#16A34A"
      />
      {w.policy.isSample ? (
        <p style={{ marginTop: '12px', padding: '6px 10px', border: '1px solid #FCD34D', background: '#FFFBEB', fontSize: '11px', color: '#92400E' }}>
          Sample terms — for demonstration only; not a binding warranty.
        </p>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginTop: '20px' }}>
        <Field label="CUSTOMER" value={w.customer.fullName} />
        <Field label="WARRANTY TYPE" value={w.kind === 'ASSET' ? 'Vehicle warranty' : 'Part warranty'} />
        <Field label="COVERS" value={w.subjectDescription} />
        <Field label="PROVIDER" value={w.provider.name} />
        {vehicle ? <Field label="VEHICLE" value={`${vehicle}${w.vehicle?.plateNumber ? ` — ${w.vehicle.plateNumber}` : ''}`} /> : null}
        {w.vehicle?.chassisNumber ? <Field label="VIN" value={w.vehicle.chassisNumber} /> : null}
        {w.partSerial ? <Field label="SERIAL NUMBER" value={w.partSerial.serialNumber} /> : null}
        <Field label="POLICY" value={`${w.policy.name} (${w.policy.code})`} />
        <Field label="VALID FROM" value={`${formatDateOnly(w.startsAt)}${w.startReading !== null ? ` at ${w.startReading.toLocaleString('en-NG')} km` : ''}`} />
        <Field label="VALID UNTIL (WHICHEVER COMES FIRST)" value={`${formatDateOnly(w.endsAt)}${distanceEnd !== null ? ` or ${distanceEnd.toLocaleString('en-NG')} km` : ''}`} />
        {refs ? <Field label="REFERENCES" value={refs} /> : null}
        <Field label="STATUS" value={`${WARRANTY_STATE_LABEL[cov.state]} — ${cov.reason}`} />
      </div>
      <Block title="WHAT IS COVERED" text={w.coverageSnapshot} />
      {w.exclusionsSnapshot ? <Block title="NOT COVERED" text={w.exclusionsSnapshot} /> : null}
      {w.conditionsSnapshot ? <Block title="CONDITIONS" text={w.conditionsSnapshot} /> : null}
      <p style={{ marginTop: '14px', fontSize: '11px', color: '#475569' }}>
        Please keep this certificate and quote the warranty number {w.warrantyNumber} when reporting a problem. Coverage is subject to the terms above.
      </p>
      {isOrgCopy ? (
        <p style={{ marginTop: '10px', fontSize: '11px', color: '#475569' }}>
          {w.origin === 'AUTO' ? 'Issued automatically with a part release' : 'Registered by staff'} on {formatDateTime(w.issuedAt)}
          {w.issuedBy ? ` by ${w.issuedBy.fullName}` : ''}
          {w.verifiedAt ? `; verified ${formatDateTime(w.verifiedAt)}${w.verifiedBy ? ` by ${w.verifiedBy.fullName}` : ''}` : ''}.
          {w.evidenceNote ? ` Evidence: ${w.evidenceNote}.` : ''}
        </p>
      ) : null}
      <SignatureBlock issuerLabel="Issued By" issuerName={isOrgCopy ? w.issuedBy?.fullName ?? '' : ''} collectorLabel="Customer" collectorName={w.customer.fullName} />
      <DocumentFooter organisation={organisation} />
    </div>
  );
}
