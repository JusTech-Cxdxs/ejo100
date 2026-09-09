import { notFound } from 'next/navigation';
import { getPartRequestSlip } from '@/lib/actions/sourcing';
import { getOrganisation } from '@/lib/actions/organisation';
import { DocumentHeader, SignatureBlock, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { pluralizeWord, pluralize } from '@/lib/utils/pluralize';
import { formatDateTime } from '@/lib/utils/format-date';

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_HOD_APPROVAL: 'Awaiting HOD approval',
  PENDING_STORE_APPROVAL: 'Awaiting Store approval',
  APPROVED: 'Approved — awaiting release',
  RELEASED: 'Released',
  REJECTED: 'Rejected',
};

/** One label-above-value pair — tight spacing between the two, since
 * a label sitting far from its own value was the single most common
 * complaint about the first version of this document. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '1px' }}>{value}</div>
    </div>
  );
}

/**
 * A real, standalone printable document — deliberately outside the
 * app's own dashboard layout entirely (no sidebar, no nav, no other
 * page chrome to accidentally print along with it), so the browser's
 * own print dialog only ever sees this one document, not a
 * screenshot of the whole portal.
 *
 * Only ever reachable once the slip is genuinely RELEASED — this is
 * the final stage for a Store Parts Request, the point where there's
 * a real, complete story to document and hand over, not a
 * work-in-progress snapshot.
 */
export default async function PrintPartRequestSlipPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrgCopy = variant !== 'client';

  const [slip, organisation] = await Promise.all([getPartRequestSlip(id), getOrganisation()]);
  if (!slip || !organisation) notFound();
  if (slip.status !== 'RELEASED') notFound();

  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
  const logoUrl = `${portalUrl}/images/logo/logo.png`;
  const totalAmount = slip.lines.reduce((sum: number, l: (typeof slip.lines)[number]) => sum + (l.estimateLineItem?.amount !== null && l.estimateLineItem?.amount !== undefined ? Number(l.estimateLineItem.amount) : 0), 0);
  const collectorName = slip.receivedByUser?.fullName ?? slip.receivedByName ?? null;
  const vehicleSummary = [slip.jobCard.vehicle.year, slip.jobCard.vehicle.make, slip.jobCard.vehicle.model].filter(Boolean).join(' ') || '—';

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '32px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader
        organisation={organisation}
        branch={slip.jobCard.branch}
        logoUrl={logoUrl}
        documentTitle={isOrgCopy ? 'Store Parts Request' : 'Parts Collection Receipt'}
        referenceNumber={slip.referenceNumber}
        statusLabel={STATUS_LABEL[slip.status] ?? slip.status}
        accentColor="#16A34A"
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginTop: '20px' }}>
        <Field label="JOB CARD" value={slip.jobCard.jobNumber} />
        <Field label="CUSTOMER" value={slip.jobCard.customer.fullName} />
        <Field label="VEHICLE" value={vehicleSummary} />
        <Field label="PLATE NO." value={slip.jobCard.vehicle.plateNumber ?? '—'} />
        <Field label="VIN / CHASSIS" value={slip.jobCard.vehicle.chassisNumber ?? '—'} />
        <Field label="DATE OF REQUEST" value={formatDateTime(new Date(slip.createdAt))} />
        {isOrgCopy ? (
          <>
            <Field label="REQUESTED BY" value={slip.requestedBy.fullName} />
            <Field label="RELEASED BY" value={slip.releasedBy?.fullName ?? '—'} />
          </>
        ) : null}
      </div>

      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '24px', fontSize: '12px' }}>
        <thead>
          <tr style={{ borderBottom: '1.5px solid #0F172A', textAlign: 'left' }}>
            <th style={{ padding: '6px 4px' }}>S/N</th>
            <th style={{ padding: '6px 4px' }}>Part No.</th>
            <th style={{ padding: '6px 4px' }}>Part Name</th>
            <th style={{ padding: '6px 4px', textAlign: 'right' }}>Quantity</th>
            <th style={{ padding: '6px 4px', textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {slip.lines.map((line: (typeof slip.lines)[number], i: number) => (
            <tr key={line.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
              <td style={{ padding: '6px 4px' }}>{i + 1}</td>
              <td style={{ padding: '6px 4px' }}>{line.part.partNumber ?? '—'}</td>
              <td style={{ padding: '6px 4px' }}>{line.part.name}</td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                {Number(line.quantityRequested)} {pluralizeWord(Number(line.quantityRequested), line.part.baseUnitOfMeasure)}
              </td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                {line.estimateLineItem?.amount !== null && line.estimateLineItem?.amount !== undefined ? formatNaira(Number(line.estimateLineItem.amount)) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '1.5px solid #0F172A', fontWeight: 700 }}>
            <td style={{ padding: '6px 4px' }} colSpan={4}>
              {pluralize(slip.lines.length, 'Part')} total
            </td>
            <td style={{ padding: '6px 4px', textAlign: 'right' }}>{formatNaira(totalAmount)}</td>
          </tr>
        </tfoot>
      </table>

      {isOrgCopy ? (
        <div style={{ marginTop: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>DOCUMENT TRAIL</div>
          <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <tbody>
              <tr>
                <td style={{ padding: '2px 0', color: '#475569', width: '25%' }}>Requested</td>
                <td style={{ padding: '2px 0' }}>{slip.requestedBy.fullName} — {formatDateTime(new Date(slip.createdAt))}</td>
              </tr>
              {slip.hodApprovedBy ? (
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>HOD Approved</td>
                  <td style={{ padding: '2px 0' }}>{slip.hodApprovedBy.fullName} — {slip.hodApprovedAt ? formatDateTime(new Date(slip.hodApprovedAt)) : ''}</td>
                </tr>
              ) : null}
              {slip.storeApprovedBy ? (
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Store Approved</td>
                  <td style={{ padding: '2px 0' }}>{slip.storeApprovedBy.fullName} — {slip.storeApprovedAt ? formatDateTime(new Date(slip.storeApprovedAt)) : ''}</td>
                </tr>
              ) : null}
              <tr>
                <td style={{ padding: '2px 0', color: '#475569' }}>Released</td>
                <td style={{ padding: '2px 0' }}>{slip.releasedBy?.fullName ?? '—'} — {slip.releasedAt ? formatDateTime(new Date(slip.releasedAt)) : ''}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      <SignatureBlock
        issuerLabel="Issued By (Store)"
        issuerName={slip.releasedBy?.fullName ?? null}
        collectorLabel="Received By"
        collectorName={collectorName}
      />

      <DocumentFooter organisation={organisation} />
    </div>
  );
}
