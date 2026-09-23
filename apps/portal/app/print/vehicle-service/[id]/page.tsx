import { notFound } from 'next/navigation';
import { getVehicleService, getVehicleServiceCloseRequests } from '@/lib/actions/vehicle-service';
import { getServiceEstimate } from '@/lib/actions/vehicle-service-estimate';
import { getVehicleServicePayments } from '@/lib/actions/vehicle-service-payment';
import { getVehicleServiceSourcingNeeds } from '@/lib/actions/sourcing';
import { getOrganisation } from '@/lib/actions/organisation';
import { DocumentHeader, SignatureBlock, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { pluralize, pluralizeWord } from '@/lib/utils/pluralize';
import { formatDateTime, formatDateOnly } from '@/lib/utils/format-date';
import { workingDaysBetween } from '@/lib/utils/working-days';

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TYPE_LABEL: Record<string, string> = {
  STORE_PART: 'Store Part',
  INTERNAL_JOB: 'Internal Job',
  LABOUR: 'Labour',
  SUNDRY: 'Sundry',
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  CARD: 'Card',
  CHEQUE: 'Cheque',
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '1px' }}>{value}</div>
    </div>
  );
}

/**
 * Vehicle Collection Receipt for a Vehicle Service — the parallel of
 * Job Card's own collection receipt (print/job-cards/[id]). Organisation
 * Copy by default, Customer Copy with ?variant=client.
 *
 * Gated on COLLECTED (checked out) — the real physical-exit moment, the
 * same reasoning as Job Card's CHECKED_OUT gate: CLOSED is an
 * administrative sign-off that can happen while the vehicle is still in
 * the yard.
 */
export default async function PrintVehicleServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrgCopy = variant !== 'client';

  const [service, estimate, payments, closeRequests, sourcing, organisation] = await Promise.all([
    getVehicleService(id),
    getServiceEstimate(id),
    getVehicleServicePayments(id),
    getVehicleServiceCloseRequests(id),
    getVehicleServiceSourcingNeeds(id),
    getOrganisation(),
  ]);
  if (!service || !organisation) notFound();
  if (service.status !== 'COLLECTED') notFound();

  const approvedClose = closeRequests.find((r: (typeof closeRequests)[number]) => r.status === 'APPROVED') ?? null;
  const lineItems = estimate?.lineItems ?? [];
  const totalEstimate = lineItems.reduce((sum: number, l: (typeof lineItems)[number]) => sum + (l.amount !== null ? Number(l.amount) : 0), 0);
  const totalPaid = payments.reduce((sum: number, p: (typeof payments)[number]) => sum + Number(p.amount), 0);
  const vehicleSummary = [service.vehicle.year, service.vehicle.make, service.vehicle.model, service.vehicle.engineType].filter(Boolean).join(' ') || 'No vehicle details on file';
  // Working days only, ending at the real physical-exit moment — a
  // final, frozen figure, since this document only exists once checked out.
  const daysInCustody = workingDaysBetween(service.checkedInAt ?? service.createdAt, service.collectedAt ?? new Date());
  const inServiceDuration = service.workStartedAt
    ? workingDaysBetween(service.workStartedAt, service.completedAt ?? service.collectedAt ?? new Date())
    : null;
  const nextDueParts = [
    service.nextServiceDueOdometer != null ? `${service.nextServiceDueOdometer.toLocaleString('en-NG')} km` : null,
    service.nextServiceDueDate ? formatDateOnly(service.nextServiceDueDate) : null,
  ].filter(Boolean);

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '32px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader
        organisation={organisation}
        branch={service.branch}
        logoUrl={`${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app'}/images/logo/logo.png`}
        documentTitle={isOrgCopy ? 'Vehicle Service — Vehicle Collection Record' : 'Vehicle Collection Receipt'}
        referenceNumber={service.serviceNumber}
        statusLabel="Checked Out"
        accentColor="#16A34A"
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginTop: '20px' }}>
        <Field label="CUSTOMER" value={service.customer.fullName} />
        <Field label="VEHICLE" value={vehicleSummary} />
        <Field label="PLATE NO." value={service.vehicle.plateNumber ?? '—'} />
        <Field label="VIN / CHASSIS" value={service.vehicle.chassisNumber ?? '—'} />
        <Field label="CHECKED IN" value={formatDateTime(new Date(service.checkedInAt ?? service.createdAt))} />
        <Field label="CHECKED OUT" value={service.collectedAt ? formatDateTime(new Date(service.collectedAt)) : '—'} />
        <Field label="MILEAGE AT SERVICE" value={service.odometerAtService != null ? `${service.odometerAtService.toLocaleString('en-NG')} km` : '—'} />
        <Field label="NEXT SERVICE DUE" value={nextDueParts.length > 0 ? `${nextDueParts.join(' or ')} (whichever first)` : '—'} />
        {service.customer.address ? <Field label="CUSTOMER ADDRESS" value={service.customer.address} /> : null}
        {isOrgCopy ? (
          <>
            <Field label="TECHNICIAN IN CHARGE" value={service.assignedTechnician?.fullName ?? '—'} />
            <Field label="WORKSHOP SUPERVISOR" value={service.supervisor?.fullName ?? '—'} />
            <Field label="TOTAL TIME IN CUSTODY" value={pluralize(daysInCustody, 'working day')} />
            {inServiceDuration !== null ? <Field label="IN SERVICE DURATION" value={pluralize(inServiceDuration, 'working day')} /> : null}
            {sourcing.existingPartRequestSlips.length > 0 ? (
              <Field
                label={pluralize(sourcing.existingPartRequestSlips.length, 'STORE PARTS REQUEST REF', 'STORE PARTS REQUEST REFS')}
                value={sourcing.existingPartRequestSlips.map((s: (typeof sourcing.existingPartRequestSlips)[number]) => s.referenceNumber).join(', ')}
              />
            ) : null}
          </>
        ) : null}
      </div>

      {service.complaints.length > 0 ? (
        <div style={{ marginTop: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>CUSTOMER&apos;S REQUESTS</div>
          <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '12px' }}>
            {service.complaints.map((c: (typeof service.complaints)[number]) => (
              <li key={c.id}>{c.description}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {isOrgCopy && service.technicianNotes ? (
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>TECHNICIAN NOTES</div>
          <div style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>{service.technicianNotes}</div>
        </div>
      ) : null}

      {lineItems.length > 0 ? (
        <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '1.5px solid #0F172A', textAlign: 'left' }}>
              <th style={{ padding: '6px 4px' }}>S/N</th>
              <th style={{ padding: '6px 4px' }}>Description</th>
              {/* The internal type breakdown is company-internal — never
                  shown to a customer. Organisation copy only. */}
              {isOrgCopy ? <th style={{ padding: '6px 4px' }}>Type</th> : null}
              <th style={{ padding: '6px 4px', textAlign: 'right' }}>Quantity</th>
              <th style={{ padding: '6px 4px', textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((line: (typeof lineItems)[number], i: number) => {
              const qty = Number(line.quantity);
              return (
                <tr key={line.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px 4px' }}>{i + 1}</td>
                  <td style={{ padding: '6px 4px' }}>{line.description}</td>
                  {isOrgCopy ? <td style={{ padding: '6px 4px' }}>{TYPE_LABEL[line.type] ?? line.type}</td> : null}
                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                    {qty}
                    {line.unitOfMeasure ? ` ${pluralizeWord(qty, line.unitOfMeasure)}` : ''}
                  </td>
                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>{line.amount !== null ? formatNaira(Number(line.amount)) : '—'}</td>
                </tr>
              );
            })}
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

      {isOrgCopy && payments.length > 0 ? (
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>PAYMENT RECORD</div>
          <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <tbody>
              {payments.map((p: (typeof payments)[number]) => (
                <tr key={p.id}>
                  <td style={{ padding: '2px 0', color: '#475569', width: '25%' }}>{formatDateTime(new Date(p.recordedAt))}</td>
                  <td style={{ padding: '2px 0' }}>
                    {PAYMENT_METHOD_LABEL[p.method] ?? p.method} — {formatNaira(Number(p.amount))} — recorded by {p.recordedBy.fullName}
                  </td>
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
                <td style={{ padding: '2px 0', color: '#475569', width: '25%' }}>Opened</td>
                <td style={{ padding: '2px 0' }}>{service.createdBy.fullName} — {formatDateTime(new Date(service.createdAt))}</td>
              </tr>
              {service.approvedBy ? (
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Approved</td>
                  <td style={{ padding: '2px 0' }}>{service.approvedBy.fullName} — {service.approvedAt ? formatDateTime(new Date(service.approvedAt)) : ''}</td>
                </tr>
              ) : null}
              {service.workStartedAt ? (
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Work Started</td>
                  <td style={{ padding: '2px 0' }}>{formatDateTime(new Date(service.workStartedAt))}</td>
                </tr>
              ) : null}
              {service.completedAt ? (
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Completed</td>
                  <td style={{ padding: '2px 0' }}>{formatDateTime(new Date(service.completedAt))}</td>
                </tr>
              ) : null}
              {service.readyForCollectionAt ? (
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Ready for Collection</td>
                  <td style={{ padding: '2px 0' }}>{formatDateTime(new Date(service.readyForCollectionAt))}</td>
                </tr>
              ) : null}
              {service.closedAt ? (
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Closed</td>
                  <td style={{ padding: '2px 0' }}>
                    {approvedClose ? `Requested by ${approvedClose.requestedBy.fullName}, approved by ${approvedClose.decidedBy?.fullName ?? '—'} — ` : ''}
                    {formatDateTime(new Date(service.closedAt))}
                  </td>
                </tr>
              ) : null}
              <tr>
                <td style={{ padding: '2px 0', color: '#475569' }}>Checked Out</td>
                <td style={{ padding: '2px 0' }}>
                  {service.collectedAt ? formatDateTime(new Date(service.collectedAt)) : '—'} — collected by {service.collectedByName ?? '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      <SignatureBlock
        issuerLabel="Released By (Workshop)"
        issuerName={service.supervisor?.fullName ?? service.assignedTechnician?.fullName ?? null}
        collectorLabel="Collected By"
        collectorName={service.collectedByName}
      />

      <DocumentFooter organisation={organisation} />
    </div>
  );
}
