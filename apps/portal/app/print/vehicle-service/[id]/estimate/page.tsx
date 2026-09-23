import { notFound } from 'next/navigation';
import { getVehicleService, getVehicleServiceAuditTrail } from '@/lib/actions/vehicle-service';
import { getServiceEstimate } from '@/lib/actions/vehicle-service-estimate';
import { getVehicleServicePayments } from '@/lib/actions/vehicle-service-payment';
import { getOrganisation } from '@/lib/actions/organisation';
import { EstimatePrintDocument, isEstimateAuditAction } from '@/components/print/EstimatePrintDocument';
import { COMPANY_BANK_DETAILS, MINIMUM_DEPOSIT_FRACTION } from '@/lib/workshop-constants';

const TYPE_ORDER = ['STORE_PART', 'INTERNAL_JOB', 'LABOUR', 'SUNDRY'];
const TYPE_LABEL: Record<string, string> = {
  STORE_PART: 'Store Part',
  INTERNAL_JOB: 'Internal Job',
  LABOUR: 'Labour',
  SUNDRY: 'Sundry',
};

/**
 * Printable estimate for a Vehicle Service — the exact same document
 * Job Card prints (shared EstimatePrintDocument). Organisation Copy by
 * default, Customer Copy with ?variant=client. Only exists once the
 * Manager has given final approval.
 */
export default async function PrintVehicleServiceEstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { id } = await params;
  const { variant } = await searchParams;
  const [service, estimate, payments, auditTrail, organisation] = await Promise.all([
    getVehicleService(id),
    getServiceEstimate(id),
    getVehicleServicePayments(id),
    getVehicleServiceAuditTrail(id),
    getOrganisation(),
  ]);
  if (!service || !estimate || !organisation) notFound();
  if (estimate.status !== 'MANAGER_APPROVED') notFound();

  const vehicleDescription = [service.vehicle.make, service.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';

  return (
    <EstimatePrintDocument
      isOrgCopy={variant !== 'client'}
      organisation={organisation}
      branch={service.branch}
      logoUrl={`${portalUrl}/images/logo/logo.png`}
      kindLabel="Vehicle Service"
      referenceNumber={service.serviceNumber}
      customer={{ name: service.customer.fullName, address: service.customer.address, phone: service.customer.phone, email: service.customer.email }}
      vehicle={{
        summary: [service.vehicle.year, service.vehicle.make, service.vehicle.model, service.vehicle.engineType].filter(Boolean).join(' ') || 'No vehicle details on file',
        plateNumber: service.vehicle.plateNumber,
        chassisNumber: service.vehicle.chassisNumber,
        mileageKm: service.odometerAtService,
      }}
      requestsTitle="Customer's Requests"
      requests={service.complaints.map((c: (typeof service.complaints)[number]) => c.description)}
      people={{
        technician: service.assignedTechnician?.fullName ?? null,
        supervisor: service.supervisor?.fullName ?? null,
        department: service.department?.name ?? null,
        openedBy: service.createdBy?.fullName ?? null,
        openedAt: new Date(service.createdAt),
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
      paymentReference={[service.serviceNumber, vehicleDescription, service.vehicle.plateNumber].filter(Boolean).join(' — ')}
    />
  );
}
