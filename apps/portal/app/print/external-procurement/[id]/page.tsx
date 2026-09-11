import { notFound } from 'next/navigation';
import { getExternalProcurementRequest } from '@/lib/actions/sourcing';
import { getOrganisation } from '@/lib/actions/organisation';
import { DocumentHeader, SignatureBlock, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { pluralize } from '@/lib/utils/pluralize';
import { formatDateTime } from '@/lib/utils/format-date';

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** One label-above-value pair — same tight spacing already proven on
 * every other real print document in this system. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '1px' }}>{value}</div>
    </div>
  );
}

/**
 * A real, standalone printable document for a disbursed External
 * Procurement Request — the second of the two document types still
 * missing from the receipt system's original roadmap. Same real
 * structure already proven on the Parts Request print: standalone
 * (no app chrome), organisation+branch letterhead, a field grid, a
 * real line-items table, an organisation-copy-only document trail,
 * and a signature block — adapted here for disbursement (not
 * release) and for this request's own real shape: a legacy
 * single-line request (description/estimatedAmount only) or a
 * genuinely multi-line one (real `lines`), plus whatever real
 * supplementary lines Finance added along the way.
 *
 * Only ever reachable once the request is genuinely DISBURSED — the
 * real final stage, the point where there's a complete, real story
 * to hand over, not a work-in-progress snapshot.
 */
export default async function PrintExternalProcurementRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrgCopy = variant !== 'client';

  const [request, organisation] = await Promise.all([getExternalProcurementRequest(id), getOrganisation()]);
  if (!request || !organisation) notFound();
  if (request.status !== 'DISBURSED') notFound();

  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
  const logoUrl = `${portalUrl}/images/logo/logo.png`;
  const vehicleSummary = [request.jobCard.vehicle.year, request.jobCard.vehicle.make, request.jobCard.vehicle.model].filter(Boolean).join(' ') || '—';

  // A genuinely multi-line request has real rows in `lines`; a
  // legacy, single-line one has none — its one real item is its own
  // top-level description/estimatedAmount instead. Either way, every
  // supplementary line Finance genuinely added still applies on top.
  const baseLines = request.lines.length > 0
    ? request.lines.map((l: (typeof request.lines)[number]) => ({ description: l.description, amount: Number(l.amount) }))
    : [{ description: request.description, amount: Number(request.estimatedAmount) }];
  const supplementaryLines = request.supplementaryLines.map((l: (typeof request.supplementaryLines)[number]) => ({ description: l.description, amount: Number(l.amount) }));
  const allLines = [...baseLines, ...supplementaryLines];
  const disbursedAmount = request.disbursedAmount !== null ? Number(request.disbursedAmount) : allLines.reduce((sum, l) => sum + l.amount, 0);

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '32px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader
        organisation={organisation}
        branch={request.jobCard.branch}
        logoUrl={logoUrl}
        documentTitle={isOrgCopy ? 'External Procurement Request' : 'Procurement Disbursement Receipt'}
        referenceNumber={request.referenceNumber}
        statusLabel="Disbursed"
        accentColor="#16A34A"
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginTop: '20px' }}>
        <Field label="JOB CARD" value={request.jobCard.jobNumber} />
        <Field label="CUSTOMER" value={request.jobCard.customer.fullName} />
        <Field label="VEHICLE" value={vehicleSummary} />
        <Field label="PLATE NO." value={request.jobCard.vehicle.plateNumber ?? '—'} />
        <Field label="VIN / CHASSIS" value={request.jobCard.vehicle.chassisNumber ?? '—'} />
        <Field label="DATE OF REQUEST" value={formatDateTime(new Date(request.createdAt))} />
        {request.jobCard.customer.address ? <Field label="CUSTOMER ADDRESS" value={request.jobCard.customer.address} /> : null}
        {isOrgCopy ? (
          <>
            <Field label="TECHNICIAN IN CHARGE" value={request.jobCard.assignedTechnician?.fullName ?? '—'} />
            <Field label="WORKSHOP SUPERVISOR" value={request.jobCard.supervisor?.fullName ?? '—'} />
            <Field label="REQUESTED BY" value={request.requestedBy.fullName} />
            <Field label="DISBURSED BY" value={request.disbursedBy?.fullName ?? '—'} />
            {request.paymentMethod ? <Field label="PAYMENT METHOD" value={request.paymentMethod} /> : null}
            {request.paymentReference ? <Field label="PAYMENT REFERENCE" value={request.paymentReference} /> : null}
          </>
        ) : null}
      </div>

      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '24px', fontSize: '12px' }}>
        <thead>
          <tr style={{ borderBottom: '1.5px solid #0F172A', textAlign: 'left' }}>
            <th style={{ padding: '6px 4px' }}>S/N</th>
            <th style={{ padding: '6px 4px' }}>Description</th>
            <th style={{ padding: '6px 4px', textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {allLines.map((line, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <tr key={i} style={{ borderBottom: '1px solid #E2E8F0' }}>
              <td style={{ padding: '6px 4px' }}>{i + 1}</td>
              <td style={{ padding: '6px 4px' }}>{line.description}</td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>{formatNaira(line.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '1.5px solid #0F172A', fontWeight: 700 }}>
            <td style={{ padding: '6px 4px' }} colSpan={2}>
              {pluralize(allLines.length, 'Item')} total
            </td>
            <td style={{ padding: '6px 4px', textAlign: 'right' }}>{formatNaira(disbursedAmount)}</td>
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
                <td style={{ padding: '2px 0' }}>{request.requestedBy.fullName} — {formatDateTime(new Date(request.createdAt))}</td>
              </tr>
              {request.financeReviewedBy ? (
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Finance Reviewed</td>
                  <td style={{ padding: '2px 0' }}>{request.financeReviewedBy.fullName} — {request.financeReviewedAt ? formatDateTime(new Date(request.financeReviewedAt)) : ''}</td>
                </tr>
              ) : null}
              {request.managerApprovedBy ? (
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Manager Approved</td>
                  <td style={{ padding: '2px 0' }}>{request.managerApprovedBy.fullName} — {request.managerApprovedAt ? formatDateTime(new Date(request.managerApprovedAt)) : ''}</td>
                </tr>
              ) : null}
              <tr>
                <td style={{ padding: '2px 0', color: '#475569' }}>Disbursed</td>
                <td style={{ padding: '2px 0' }}>{request.disbursedBy?.fullName ?? '—'} — {request.disbursedAt ? formatDateTime(new Date(request.disbursedAt)) : ''}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      <SignatureBlock
        issuerLabel="Disbursed By (Finance)"
        issuerName={request.disbursedBy?.fullName ?? null}
        collectorLabel="Received By"
        collectorName={request.requestedBy.fullName}
      />

      <DocumentFooter organisation={organisation} />
    </div>
  );
}
