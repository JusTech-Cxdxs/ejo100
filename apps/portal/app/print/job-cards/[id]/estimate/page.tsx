import { notFound } from 'next/navigation';
import { getJobCard, getJobCardEstimate, getJobCardPayments, getJobCardAuditTrail } from '@/lib/actions/workshop';
import { getOrganisation } from '@/lib/actions/organisation';
import { EstimatePrintDocument, isEstimateAuditAction } from '@/components/print/EstimatePrintDocument';
import { COMPANY_BANK_DETAILS, MINIMUM_DEPOSIT_FRACTION } from '@/lib/workshop-constants';

const TYPE_ORDER = ['STORE_PART', 'EXTERNAL_PART', 'EXTERNAL_JOB', 'INTERNAL_JOB', 'LABOUR', 'SUNDRY'];
const TYPE_LABEL: Record<string, string> = {
  STORE_PART: 'Store Part',
  EXTERNAL_PART: 'External Part',
  EXTERNAL_JOB: 'External Job',
  INTERNAL_JOB: 'Internal Job',
  LABOUR: 'Labour',
  SUNDRY: 'Sundry',
};

/**
 * Printable estimate for a Job Card — Organisation Copy by default,
 * Customer Copy with ?variant=client. Only exists once the Manager has
 * given final approval, the same moment the customer can be told.
 */
export default async function PrintJobCardEstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { id } = await params;
  const { variant } = await searchParams;
  const [jobCard, estimate, payments, auditTrail, organisation] = await Promise.all([
    getJobCard(id),
    getJobCardEstimate(id),
    getJobCardPayments(id),
    getJobCardAuditTrail(id),
    getOrganisation(),
  ]);
  if (!jobCard || !estimate || !organisation) notFound();
  if (estimate.status !== 'MANAGER_APPROVED') notFound();

  const vehicleDescription = [jobCard.vehicle.make, jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';

  return (
    <EstimatePrintDocument
      isOrgCopy={variant !== 'client'}
      organisation={organisation}
      branch={jobCard.branch}
      logoUrl={`${portalUrl}/images/logo/logo.png`}
      kindLabel="Job Card"
      referenceNumber={jobCard.jobNumber}
      customer={{ name: jobCard.customer.fullName, address: jobCard.customer.address, phone: jobCard.customer.phone, email: jobCard.customer.email }}
      vehicle={{
        summary: [jobCard.vehicle.year, jobCard.vehicle.make, jobCard.vehicle.model, jobCard.vehicle.engineType].filter(Boolean).join(' ') || 'No vehicle details on file',
        plateNumber: jobCard.vehicle.plateNumber,
        chassisNumber: jobCard.vehicle.chassisNumber,
        mileageKm: jobCard.mileageAtCheckIn,
      }}
      requestsTitle="Reported Complaints"
      requests={jobCard.complaints.map((c: (typeof jobCard.complaints)[number]) => c.description)}
      people={{
        technician: jobCard.assignedTechnician?.fullName ?? null,
        supervisor: jobCard.supervisor?.fullName ?? null,
        department: jobCard.department?.name ?? null,
        openedBy: jobCard.createdBy?.fullName ?? null,
        openedAt: new Date(jobCard.createdAt),
      }}
      approvals={{
        validatedBy: estimate.approvedBy?.fullName ?? null,
        validatedAt: estimate.approvedAt ? new Date(estimate.approvedAt) : null,
        managerApprovedBy: estimate.managerApprovedBy?.fullName ?? null,
        managerApprovedAt: estimate.managerApprovedAt ? new Date(estimate.managerApprovedAt) : null,
        customerNotifiedAt: estimate.customerNotifiedAt ? new Date(estimate.customerNotifiedAt) : null,
      }}
      lines={estimate.lineItems.map((l: (typeof estimate.lineItems)[number]) => ({
        id: l.id,
        description: l.description,
        typeKey: l.type,
        typeLabel: TYPE_LABEL[l.type] ?? l.type,
        quantity: Number(l.quantity),
        unitOfMeasure: l.unitOfMeasure,
        unitPrice: l.unitPrice !== null ? Number(l.unitPrice) : null,
        amount: l.amount !== null ? Number(l.amount) : null,
        enteredBy: l.enteredBy?.fullName ?? null,
      }))}
      typeOrder={TYPE_ORDER}
      typeLabels={TYPE_LABEL}
      payments={payments.map((p: (typeof payments)[number]) => ({
        id: p.id,
        recordedAt: new Date(p.recordedAt),
        method: p.method,
        amount: Number(p.amount),
        recordedBy: p.recordedBy.fullName,
        notes: p.notes,
      }))}
      auditEntries={auditTrail
        .filter((e: (typeof auditTrail)[number]) => isEstimateAuditAction(e.action))
        .sort((a: (typeof auditTrail)[number], b: (typeof auditTrail)[number]) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())}
      bank={COMPANY_BANK_DETAILS}
      minimumDepositFraction={MINIMUM_DEPOSIT_FRACTION}
      paymentReference={[jobCard.jobNumber, vehicleDescription, jobCard.vehicle.plateNumber].filter(Boolean).join(' — ')}
    />
  );
}
