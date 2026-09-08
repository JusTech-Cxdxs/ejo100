import { notFound } from 'next/navigation';
import { getJobCard } from '@/lib/actions/workshop';
import { getOrganisation } from '@/lib/actions/organisation';
import { DocumentHeader, SignatureBlock, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { pluralize } from '@/lib/utils/pluralize';
import { formatDateTime } from '@/lib/utils/format-date';

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TYPE_LABEL: Record<string, string> = {
  STORE_PART: 'Part',
  EXTERNAL_PART: 'External Part',
  EXTERNAL_JOB: 'External Job',
  INTERNAL_JOB: 'Labour',
  LABOUR: 'Labour',
  SUNDRY: 'Sundry',
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  CARD: 'Card',
  CHEQUE: 'Cheque',
};

/**
 * A real, standalone printable document for a Job Card, outside the
 * app's own dashboard layout entirely — the same isolated-route
 * approach already proven for the Store Parts Request receipt.
 *
 * Gated on CHECKED_OUT, not CLOSED — the schema's own comments already
 * settle this: CLOSED is an administrative sign-off that can happen
 * while the vehicle is still sitting in the yard, CHECKED_OUT is the
 * real, physical moment it actually leaves. That's the genuine final
 * stage a Vehicle Collection Receipt belongs to.
 */
export default async function PrintJobCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isCompanyVariant = variant !== 'client';

  const [jobCard, organisation] = await Promise.all([getJobCard(id), getOrganisation()]);
  if (!jobCard || !organisation) notFound();
  if (jobCard.status !== 'CHECKED_OUT') notFound();

  const lineItems = jobCard.estimate?.lineItems ?? [];
  const totalEstimate = lineItems.reduce((sum: number, l: (typeof lineItems)[number]) => sum + (l.amount !== null ? Number(l.amount) : 0), 0);
  const totalPaid = jobCard.payments.reduce((sum: number, p: (typeof jobCard.payments)[number]) => sum + Number(p.amount), 0);
  const vehicleSummary = [jobCard.vehicle.year, jobCard.vehicle.make, jobCard.vehicle.model, jobCard.vehicle.engineType].filter(Boolean).join(' ') || 'No vehicle details on file';

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '32px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader
        organisation={organisation}
        logoUrl={`${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app'}/images/logo/logo.png`}
        documentTitle={isCompanyVariant ? 'Job Card — Vehicle Collection Record' : 'Vehicle Collection Receipt'}
        referenceNumber={jobCard.jobNumber}
        statusLabel="Checked Out"
        accentColor="#16A34A"
      />

      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px', fontSize: '12px' }}>
        <tbody>
          <tr>
            <td style={{ padding: '4px 0', color: '#475569', width: '30%' }}>Customer</td>
            <td style={{ padding: '4px 0', fontWeight: 600 }}>{jobCard.customer.fullName}</td>
            <td style={{ padding: '4px 0', color: '#475569', width: '30%' }}>Vehicle</td>
            <td style={{ padding: '4px 0', fontWeight: 600 }}>{vehicleSummary}</td>
          </tr>
          <tr>
            <td style={{ padding: '4px 0', color: '#475569' }}>Plate No.</td>
            <td style={{ padding: '4px 0', fontWeight: 600 }}>{jobCard.vehicle.plateNumber ?? '—'}</td>
            <td style={{ padding: '4px 0', color: '#475569' }}>VIN / Chassis</td>
            <td style={{ padding: '4px 0', fontWeight: 600 }}>{jobCard.vehicle.chassisNumber ?? '—'}</td>
          </tr>
          <tr>
            <td style={{ padding: '4px 0', color: '#475569' }}>Checked In</td>
            <td style={{ padding: '4px 0', fontWeight: 600 }}>{formatDateTime(new Date(jobCard.createdAt))}</td>
            <td style={{ padding: '4px 0', color: '#475569' }}>Checked Out</td>
            <td style={{ padding: '4px 0', fontWeight: 600 }}>{jobCard.checkedOutAt ? formatDateTime(new Date(jobCard.checkedOutAt)) : '—'}</td>
          </tr>
          {isCompanyVariant ? (
            <tr>
              <td style={{ padding: '4px 0', color: '#475569' }}>Technician in Charge</td>
              <td style={{ padding: '4px 0', fontWeight: 600 }}>{jobCard.assignedTechnician?.fullName ?? '—'}</td>
              <td style={{ padding: '4px 0', color: '#475569' }}>Workshop Supervisor</td>
              <td style={{ padding: '4px 0', fontWeight: 600 }}>{jobCard.supervisor?.fullName ?? '—'}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {jobCard.complaints.length > 0 ? (
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>REPORTED COMPLAINTS</div>
          <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '12px' }}>
            {jobCard.complaints.map((c: (typeof jobCard.complaints)[number]) => (
              <li key={c.id}>{c.description}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {lineItems.length > 0 ? (
        <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '1.5px solid #0F172A', textAlign: 'left' }}>
              <th style={{ padding: '6px 4px' }}>S/N</th>
              <th style={{ padding: '6px 4px' }}>Description</th>
              <th style={{ padding: '6px 4px' }}>Type</th>
              <th style={{ padding: '6px 4px', textAlign: 'right' }}>Qty</th>
              <th style={{ padding: '6px 4px', textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((line: (typeof lineItems)[number], i: number) => (
              <tr key={line.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                <td style={{ padding: '6px 4px' }}>{i + 1}</td>
                <td style={{ padding: '6px 4px' }}>{line.description}</td>
                <td style={{ padding: '6px 4px' }}>{TYPE_LABEL[line.type] ?? line.type}</td>
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>{line.quantity}</td>
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>{line.amount !== null ? formatNaira(Number(line.amount)) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1.5px solid #0F172A', fontWeight: 700 }}>
              <td style={{ padding: '6px 4px' }} colSpan={4}>
                {pluralize(lineItems.length, 'Item')} total
              </td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>{formatNaira(totalEstimate)}</td>
            </tr>
          </tfoot>
        </table>
      ) : null}

      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px', fontSize: '12px' }}>
        <tbody>
          <tr>
            <td style={{ padding: '4px 0', color: '#475569', width: '50%' }}>Total Amount</td>
            <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700 }}>{formatNaira(totalEstimate)}</td>
          </tr>
          <tr>
            <td style={{ padding: '4px 0', color: '#475569' }}>Total Paid</td>
            <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700 }}>{formatNaira(totalPaid)}</td>
          </tr>
        </tbody>
      </table>

      {isCompanyVariant && jobCard.payments.length > 0 ? (
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>PAYMENT RECORD</div>
          <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <tbody>
              {jobCard.payments.map((p: (typeof jobCard.payments)[number]) => (
                <tr key={p.id}>
                  <td style={{ padding: '2px 0', color: '#475569', width: '25%' }}>{formatDateTime(new Date(p.recordedAt))}</td>
                  <td style={{ padding: '2px 0' }}>{PAYMENT_METHOD_LABEL[p.method] ?? p.method} — {formatNaira(Number(p.amount))} — recorded by {p.recordedBy.fullName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {isCompanyVariant ? (
        <div style={{ marginTop: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>AUDIT TRAIL</div>
          <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <tbody>
              <tr>
                <td style={{ padding: '2px 0', color: '#475569', width: '25%' }}>Checked In</td>
                <td style={{ padding: '2px 0' }}>{jobCard.createdBy.fullName} — {formatDateTime(new Date(jobCard.createdAt))}</td>
              </tr>
              {jobCard.approvedBy ? (
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Approved</td>
                  <td style={{ padding: '2px 0' }}>{jobCard.approvedBy.fullName} — {jobCard.approvedAt ? formatDateTime(new Date(jobCard.approvedAt)) : ''}</td>
                </tr>
              ) : null}
              {jobCard.workStartedAt ? (
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Work Started</td>
                  <td style={{ padding: '2px 0' }}>{formatDateTime(new Date(jobCard.workStartedAt))}</td>
                </tr>
              ) : null}
              {jobCard.completedAt ? (
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Completed</td>
                  <td style={{ padding: '2px 0' }}>{formatDateTime(new Date(jobCard.completedAt))}</td>
                </tr>
              ) : null}
              {jobCard.closedAt ? (
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Closed</td>
                  <td style={{ padding: '2px 0' }}>{formatDateTime(new Date(jobCard.closedAt))}</td>
                </tr>
              ) : null}
              <tr>
                <td style={{ padding: '2px 0', color: '#475569' }}>Checked Out</td>
                <td style={{ padding: '2px 0' }}>{jobCard.checkedOutAt ? formatDateTime(new Date(jobCard.checkedOutAt)) : '—'} — collected by {jobCard.collectedByName ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      <SignatureBlock
        issuerLabel="Released By (Workshop)"
        issuerName={jobCard.supervisor?.fullName ?? jobCard.assignedTechnician?.fullName ?? null}
        collectorLabel="Collected By"
        collectorName={jobCard.collectedByName}
      />

      <DocumentFooter organisation={organisation} />
    </div>
  );
}
