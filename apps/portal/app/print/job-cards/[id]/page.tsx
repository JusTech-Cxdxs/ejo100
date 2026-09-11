import { notFound } from 'next/navigation';
import { getJobCard } from '@/lib/actions/workshop';
import { getOrganisation } from '@/lib/actions/organisation';
import { DocumentHeader, SignatureBlock, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { pluralize, pluralizeWord } from '@/lib/utils/pluralize';
import { formatDateTime } from '@/lib/utils/format-date';
import { workingDaysBetween } from '@/lib/utils/working-days';

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
  const isOrgCopy = variant !== 'client';

  const [jobCard, organisation] = await Promise.all([getJobCard(id), getOrganisation()]);
  if (!jobCard || !organisation) notFound();
  if (jobCard.status !== 'CHECKED_OUT') notFound();

  // Once a cancelled Job Card is checked out, its own status field
  // becomes CHECKED_OUT too — identical to a normal completed one.
  // The one real place "this was cancelled" still survives is an
  // approved cancellation request against it, so that's the real
  // signal this document's own cancelled variant is built on.
  const cancellation = jobCard.cancellationRequests[0] ?? null;
  const wasCancelled = Boolean(cancellation);

  const lineItems = jobCard.estimate?.lineItems ?? [];
  const totalEstimate = lineItems.reduce((sum: number, l: (typeof lineItems)[number]) => sum + (l.amount !== null ? Number(l.amount) : 0), 0);
  const totalPaid = jobCard.payments.reduce((sum: number, p: (typeof jobCard.payments)[number]) => sum + Number(p.amount), 0);
  const vehicleSummary = [jobCard.vehicle.year, jobCard.vehicle.make, jobCard.vehicle.model, jobCard.vehicle.engineType].filter(Boolean).join(' ') || 'No vehicle details on file';
  const accentColor = wasCancelled ? '#DC2626' : '#16A34A';
  // Same real logic as the Job Card's own detail page — working days
  // only (no Saturday/Sunday), ending at checkedOutAt specifically
  // (the true physical-exit moment). This document only ever exists
  // once a Job Card is genuinely CHECKED_OUT (see the notFound() gate
  // above), so both figures are always the real, final, frozen count
  // here — never the still-running version.
  const daysInCustody = workingDaysBetween(jobCard.createdAt, jobCard.checkedOutAt ?? new Date());
  const inServiceDuration = jobCard.workStartedAt
    ? workingDaysBetween(jobCard.workStartedAt, jobCard.completedAt ?? jobCard.checkedOutAt ?? new Date())
    : null;

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '32px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader
        organisation={organisation}
        branch={jobCard.branch}
        logoUrl={`${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app'}/images/logo/logo.png`}
        documentTitle={
          wasCancelled
            ? (isOrgCopy ? 'Job Card — Cancelled, Vehicle Returned' : 'Vehicle Return Receipt (Cancelled)')
            : (isOrgCopy ? 'Job Card — Vehicle Collection Record' : 'Vehicle Collection Receipt')
        }
        referenceNumber={jobCard.jobNumber}
        statusLabel={wasCancelled ? 'Cancelled — Checked Out' : 'Checked Out'}
        accentColor={accentColor}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginTop: '20px' }}>
        <Field label="CUSTOMER" value={jobCard.customer.fullName} />
        <Field label="VEHICLE" value={vehicleSummary} />
        <Field label="PLATE NO." value={jobCard.vehicle.plateNumber ?? '—'} />
        <Field label="VIN / CHASSIS" value={jobCard.vehicle.chassisNumber ?? '—'} />
        <Field label="CHECKED IN" value={formatDateTime(new Date(jobCard.createdAt))} />
        <Field label="CHECKED OUT" value={jobCard.checkedOutAt ? formatDateTime(new Date(jobCard.checkedOutAt)) : '—'} />
        {jobCard.customer.address ? <Field label="CUSTOMER ADDRESS" value={jobCard.customer.address} /> : null}
        {isOrgCopy ? (
          <>
            <Field label="TECHNICIAN IN CHARGE" value={jobCard.assignedTechnician?.fullName ?? '—'} />
            <Field label="WORKSHOP SUPERVISOR" value={jobCard.supervisor?.fullName ?? '—'} />
            <Field label="TOTAL TIME IN CUSTODY" value={pluralize(daysInCustody, 'working day')} />
            {inServiceDuration !== null ? <Field label="IN SERVICE DURATION" value={pluralize(inServiceDuration, 'working day')} /> : null}
            {jobCard.partRequestSlips.length > 0 ? (
              <Field
                label={pluralize(jobCard.partRequestSlips.length, 'STORE PARTS REQUEST REF', 'STORE PARTS REQUEST REFS')}
                value={jobCard.partRequestSlips.map((s: (typeof jobCard.partRequestSlips)[number]) => s.referenceNumber).join(', ')}
              />
            ) : null}
            {jobCard.externalProcurementRequests.length > 0 ? (
              <Field
                label={pluralize(jobCard.externalProcurementRequests.length, 'EXTERNAL PROCUREMENT REF', 'EXTERNAL PROCUREMENT REFS')}
                value={jobCard.externalProcurementRequests.map((r: (typeof jobCard.externalProcurementRequests)[number]) => r.referenceNumber).join(', ')}
              />
            ) : null}
          </>
        ) : null}
      </div>

      {wasCancelled && cancellation ? (
        <div style={{ marginTop: '20px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#B91C1C', letterSpacing: '0.02em' }}>THIS JOB CARD WAS CANCELLED</div>
          <div style={{ fontSize: '12px', color: '#7F1D1D', marginTop: '4px' }}>
            Requested by {cancellation.requestedBy.fullName}, approved by {cancellation.decidedBy?.fullName ?? '—'}
            {cancellation.decidedAt ? ` on ${formatDateTime(new Date(cancellation.decidedAt))}` : ''}.
          </div>
          {cancellation.reason ? (
            <div style={{ fontSize: '12px', color: '#7F1D1D', marginTop: '4px' }}>
              <span style={{ fontWeight: 600 }}>Reason: </span>{cancellation.reason}
            </div>
          ) : null}
        </div>
      ) : null}

      {jobCard.complaints.length > 0 ? (
        <div style={{ marginTop: '20px' }}>
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
              {/* The internal type breakdown (Store Part / External
                  Part / External Job / Internal Job / Labour / Sundry)
                  is company-internal detail, never shown to a
                  customer — the same real rule already applied to the
                  customer estimate email. Organisation copy only. */}
              {isOrgCopy ? <th style={{ padding: '6px 4px' }}>Type</th> : null}
              <th style={{ padding: '6px 4px', textAlign: 'right' }}>Quantity</th>
              <th style={{ padding: '6px 4px', textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((line: (typeof lineItems)[number], i: number) => (
              <tr key={line.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                <td style={{ padding: '6px 4px' }}>{i + 1}</td>
                <td style={{ padding: '6px 4px' }}>{line.description}</td>
                {isOrgCopy ? <td style={{ padding: '6px 4px' }}>{TYPE_LABEL[line.type] ?? line.type}</td> : null}
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                  {line.quantity}{line.unitOfMeasure ? ` ${pluralizeWord(line.quantity, line.unitOfMeasure)}` : ''}
                </td>
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>{line.amount !== null ? formatNaira(Number(line.amount)) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1.5px solid #0F172A', fontWeight: 700 }}>
              <td style={{ padding: '6px 4px' }} colSpan={isOrgCopy ? 4 : 3}>
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

      {isOrgCopy && jobCard.payments.length > 0 ? (
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

      {isOrgCopy ? (
        <div style={{ marginTop: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>DOCUMENT TRAIL</div>
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
              {wasCancelled && cancellation ? (
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Cancelled</td>
                  <td style={{ padding: '2px 0' }}>
                    {cancellation.decidedBy?.fullName ?? '—'}
                    {cancellation.decidedAt ? ` — ${formatDateTime(new Date(cancellation.decidedAt))}` : ''}
                  </td>
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
        issuerLabel={wasCancelled ? 'Returned By (Workshop)' : 'Released By (Workshop)'}
        issuerName={jobCard.supervisor?.fullName ?? jobCard.assignedTechnician?.fullName ?? null}
        collectorLabel="Collected By"
        collectorName={jobCard.collectedByName}
      />

      <DocumentFooter organisation={organisation} />
    </div>
  );
}
