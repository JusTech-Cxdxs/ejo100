'use server';

import { prisma } from '@ejo/database';
import { requireUser, writeAuditLog, getWorkshopOrgContext } from './workshop';
import { sendEmail } from '@/lib/email';
import { renderServiceEstimateSubmittedEmail } from '@/lib/email-templates/service-estimate-submitted';
import { renderCustomerServiceEstimateApprovedEmail } from '@/lib/email-templates/customer-service-estimate-approved';
import { renderToBuffer } from '@react-pdf/renderer';
import { EstimatePdf } from '@/lib/pdf/estimate-pdf';
import { pluralizeWord } from '@/lib/utils/pluralize';
import { MINIMUM_DEPOSIT_FRACTION, COMPANY_BANK_DETAILS } from '@/lib/workshop-constants';

class ServiceEstimateActionError extends Error {}

/**
 * Creates the one real estimate for a Vehicle Service — refused if
 * the visit has already been escalated to a real Job Card (that
 * Job Card's own Estimate is the real one from that point on, never
 * this one — the two are mutually exclusive by design), and a
 * harmless no-op if a draft already exists.
 */
export async function createServiceEstimate(vehicleServiceId: string): Promise<{ id: string }> {
  const user = await requireUser();
  const existing = await prisma.serviceEstimate.findUnique({ where: { vehicleServiceId }, select: { id: true } });
  if (existing) return existing;

  const service = await prisma.vehicleService.findUnique({
    where: { id: vehicleServiceId },
    select: { serviceNumber: true, escalatedToJobCardId: true },
  });
  if (!service) {
    throw new ServiceEstimateActionError('Vehicle Service record not found.');
  }
  if (service.escalatedToJobCardId) {
    throw new ServiceEstimateActionError('This Vehicle Service was already escalated to a real Job Card — write the estimate there instead.');
  }

  const estimate = await prisma.serviceEstimate.create({
    data: { vehicleServiceId, createdById: user.id },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.created',
    entityType: 'ServiceEstimate',
    entityId: estimate.id,
    metadata: { serviceNumber: service.serviceNumber },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.created',
    entityType: 'VehicleService',
    entityId: vehicleServiceId,
    metadata: { serviceNumber: service.serviceNumber },
  });
  return { id: estimate.id };
}

/**
 * The one real, deliberate way to undo choosing the "normal service"
 * path — same flexibility as cancelVehicleInspection: genuinely
 * deletes the record after logging what happened first, so choosing
 * to escalate instead is never blocked by an abandoned draft. Only
 * while still DRAFT or SUBMITTED — once APPROVED, real Store Part
 * requests or real payments may already exist against this estimate,
 * so cancelling it at that point would orphan real, live records
 * rather than undo a choice that was never acted on yet.
 */
export async function cancelServiceEstimate(vehicleServiceId: string): Promise<void> {
  const user = await requireUser();
  const estimate = await prisma.serviceEstimate.findUnique({
    where: { vehicleServiceId },
    select: { id: true, status: true },
  });
  if (!estimate) {
    throw new ServiceEstimateActionError('No estimate exists yet for this Vehicle Service.');
  }
  if (estimate.status === 'APPROVED') {
    throw new ServiceEstimateActionError('This estimate is already approved — it can no longer be cancelled here.');
  }
  const service = await prisma.vehicleService.findUnique({ where: { id: vehicleServiceId }, select: { serviceNumber: true } });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.cancelled',
    entityType: 'ServiceEstimate',
    entityId: estimate.id,
    metadata: { serviceNumber: service?.serviceNumber, previousStatus: estimate.status },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.cancelled',
    entityType: 'VehicleService',
    entityId: vehicleServiceId,
    metadata: { serviceNumber: service?.serviceNumber, previousStatus: estimate.status },
  });
  await prisma.serviceEstimate.delete({ where: { id: estimate.id } });
}

export type ServiceEstimateLineItemInput = {
  type?: 'STORE_PART' | 'OTHER';
  description: string;
  quantity: number;
  unitPrice?: number;
  /** Only meaningful for a STORE_PART line — which generic kind of
   * part is actually needed (e.g. "Engine Oil Filter"); Store later
   * matches this to a real, specific, vehicle-fitting Part from the
   * actual catalogue via matchServiceEstimateStorePartLine below. */
  partTypeId?: string;
};

export async function addServiceEstimateLineItem(estimateId: string, input: ServiceEstimateLineItemInput): Promise<void> {
  const user = await requireUser();
  const type = input.type ?? 'OTHER';
  const description = input.description.trim();
  if (type !== 'STORE_PART' && !description) {
    throw new ServiceEstimateActionError('A description is required for this line item.');
  }
  if (type === 'STORE_PART' && !input.partTypeId) {
    throw new ServiceEstimateActionError('Choose which kind of part is needed before adding a Store Part line.');
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new ServiceEstimateActionError('Quantity must be a positive number.');
  }
  if (input.unitPrice !== undefined && (!Number.isFinite(input.unitPrice) || input.unitPrice < 0)) {
    throw new ServiceEstimateActionError('Unit price must be zero or a positive number.');
  }
  const estimate = await prisma.serviceEstimate.findUnique({
    where: { id: estimateId },
    select: { status: true, vehicleServiceId: true, vehicleService: { select: { serviceNumber: true } } },
  });
  if (!estimate) {
    throw new ServiceEstimateActionError('Estimate not found.');
  }
  if (estimate.status === 'APPROVED') {
    throw new ServiceEstimateActionError('This estimate is already approved — it can no longer be changed here.');
  }

  let realDescription = description;
  if (type === 'STORE_PART' && input.partTypeId) {
    const partType = await prisma.partType.findUnique({ where: { id: input.partTypeId }, select: { name: true } });
    if (!partType) {
      throw new ServiceEstimateActionError('That part type could not be found.');
    }
    // A Store Part line's own description is never trusted from
    // client input — always derived server-side from the real
    // PartType's own name, same principle as Job Card's own estimate.
    realDescription = partType.name;
  }

  await prisma.serviceEstimateLineItem.create({
    data: {
      estimateId,
      type,
      description: realDescription,
      quantity: input.quantity,
      unitPrice: type === 'STORE_PART' ? null : (input.unitPrice ?? null),
      amount: type !== 'STORE_PART' && input.unitPrice !== undefined ? Math.round(input.unitPrice * input.quantity * 100) / 100 : null,
      partTypeId: type === 'STORE_PART' ? input.partTypeId : null,
      enteredById: user.id,
    },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.line_item_added',
    entityType: 'ServiceEstimate',
    entityId: estimateId,
    metadata: { serviceNumber: estimate.vehicleService.serviceNumber, type, description: realDescription, quantity: input.quantity, unitPrice: input.unitPrice },
  });
}

/** The real Store-matching step — same two-moment flow, same
 * pricing-alert hard-stop, as Job Card's own estimate matching: a
 * Part currently priced below its own real cost can never be matched
 * onto a customer's estimate, here either. */
export async function matchServiceEstimateStorePartLine(lineItemId: string, partId: string): Promise<void> {
  const user = await requireUser();
  const lineItem = await prisma.serviceEstimateLineItem.findUnique({
    where: { id: lineItemId },
    select: { type: true, quantity: true, estimate: { select: { id: true, status: true, vehicleService: { select: { serviceNumber: true } } } } },
  });
  if (!lineItem) {
    throw new ServiceEstimateActionError('Line item not found.');
  }
  if (lineItem.type !== 'STORE_PART') {
    throw new ServiceEstimateActionError('Only a Store Part line can be matched to a real Part.');
  }
  if (lineItem.estimate.status === 'APPROVED') {
    throw new ServiceEstimateActionError('This estimate is already approved — it can no longer be changed here.');
  }
  const part = await prisma.part.findUnique({ where: { id: partId }, select: { id: true, name: true, sellingPrice: true, baseUnitOfMeasure: true } });
  if (!part) {
    throw new ServiceEstimateActionError('That part could not be found.');
  }
  if (part.sellingPrice === null || part.sellingPrice === undefined) {
    throw new ServiceEstimateActionError(`${part.name} has no real selling price set yet — set one before matching it to an estimate.`);
  }
  const openCriticalLoss = await prisma.pricingAlert.findFirst({ where: { partId, severity: 'CRITICAL_LOSS', status: 'OPEN' }, select: { id: true } });
  if (openCriticalLoss) {
    throw new ServiceEstimateActionError(`${part.name} is currently priced below its own real cost — resolve the open Pricing Alert on this Part before matching it to an estimate.`);
  }
  const unitPrice = Number(part.sellingPrice);
  const amount = Math.round(unitPrice * Number(lineItem.quantity) * 100) / 100;
  await prisma.serviceEstimateLineItem.update({
    where: { id: lineItemId },
    data: { matchedPartId: partId, unitPrice, amount, unitOfMeasure: part.baseUnitOfMeasure },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.line_store_matched',
    entityType: 'ServiceEstimate',
    entityId: lineItem.estimate.id,
    metadata: { serviceNumber: lineItem.estimate.vehicleService.serviceNumber, partName: part.name, unitPrice },
  });
}

export async function removeServiceEstimateLineItem(lineItemId: string): Promise<void> {
  const user = await requireUser();
  const line = await prisma.serviceEstimateLineItem.findUnique({
    where: { id: lineItemId },
    select: { description: true, estimate: { select: { id: true, status: true, vehicleService: { select: { serviceNumber: true } } } } },
  });
  if (!line) {
    throw new ServiceEstimateActionError('Line item not found.');
  }
  if (line.estimate.status === 'APPROVED') {
    throw new ServiceEstimateActionError('This estimate is already approved — it can no longer be changed here.');
  }
  await prisma.serviceEstimateLineItem.delete({ where: { id: lineItemId } });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.line_item_removed',
    entityType: 'ServiceEstimate',
    entityId: line.estimate.id,
    metadata: { serviceNumber: line.estimate.vehicleService.serviceNumber, description: line.description },
  });
}

/** Submitted is a real, deliberate "ready for the customer to see"
 * moment, distinct from still being drafted — same real reasoning
 * Job Card's own estimate uses, just without the extra Manager stage
 * that a routine Vehicle Service visit doesn't need. */
export async function submitServiceEstimate(estimateId: string): Promise<void> {
  const user = await requireUser();
  const estimate = await prisma.serviceEstimate.findUnique({
    where: { id: estimateId },
    select: {
      status: true,
      lineItems: { select: { id: true, amount: true } },
      vehicleService: {
        select: {
          id: true,
          serviceNumber: true,
          supervisorId: true,
          department: { select: { name: true } },
          customer: { select: { fullName: true } },
          supervisor: { select: { fullName: true, email: true } },
        },
      },
    },
  });
  if (!estimate) {
    throw new ServiceEstimateActionError('Estimate not found.');
  }
  if (estimate.lineItems.length === 0) {
    throw new ServiceEstimateActionError('Add at least one line item before submitting this estimate.');
  }
  await prisma.serviceEstimate.update({ where: { id: estimateId }, data: { status: 'SUBMITTED', submittedAt: new Date() } });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.submitted',
    entityType: 'ServiceEstimate',
    entityId: estimateId,
    metadata: { serviceNumber: estimate.vehicleService.serviceNumber },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.submitted',
    entityType: 'VehicleService',
    entityId: estimate.vehicleService.id,
    metadata: { serviceNumber: estimate.vehicleService.serviceNumber },
  });

  // Notify whoever approves it — fail-soft, matching every other
  // notification in this project.
  try {
    if (!estimate.vehicleService.supervisor) return;
    const submitter = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
    const orgContext = await getWorkshopOrgContext(estimate.vehicleService.department?.name);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const total = estimate.lineItems.reduce((sum: number, li: { amount: unknown }) => sum + Number(li.amount ?? 0), 0);
    await sendEmail(
      estimate.vehicleService.supervisor.email,
      `Estimate for Vehicle Service ${estimate.vehicleService.serviceNumber} needs your approval`,
      renderServiceEstimateSubmittedEmail({
        recipientName: estimate.vehicleService.supervisor.fullName,
        serviceNumber: estimate.vehicleService.serviceNumber,
        customerName: estimate.vehicleService.customer.fullName,
        submittedByName: submitter?.fullName ?? 'A team member',
        totalAmount: `₦${total.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        serviceUrl: `${portalUrl}/workshop/vehicle-service/${estimate.vehicleService.id}`,
        logoUrl: `${portalUrl}/images/logo/logo.png`,
        companyName: orgContext.companyName,
        branchName: orgContext.branchName,
        departmentName: orgContext.departmentName,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send estimate-submitted email for Vehicle Service', estimate.vehicleService.serviceNumber, err);
  }
}

export async function approveServiceEstimate(estimateId: string): Promise<void> {
  const user = await requireUser();
  const estimate = await prisma.serviceEstimate.findUnique({
    where: { id: estimateId },
    select: {
      status: true,
      lineItems: { orderBy: { createdAt: 'asc' }, select: { description: true, quantity: true, amount: true, unitOfMeasure: true } },
      vehicleService: {
        select: {
          id: true,
          serviceNumber: true,
          customer: { select: { fullName: true, email: true, address: true } },
          vehicle: { select: { make: true, model: true, year: true, plateNumber: true, chassisNumber: true } },
          branch: {
            select: {
              name: true,
              address: true,
              hotlines: true,
              email: true,
              businessUnit: { select: { organisation: { select: { name: true, legalName: true, hqAddress: true, poBox: true, rcNumber: true, hotlines: true, website: true, email: true } } } },
            },
          },
        },
      },
    },
  });
  if (!estimate) {
    throw new ServiceEstimateActionError('Estimate not found.');
  }
  if (estimate.status !== 'SUBMITTED') {
    throw new ServiceEstimateActionError('Only a submitted estimate can be approved.');
  }
  await prisma.serviceEstimate.update({
    where: { id: estimateId },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedById: user.id },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.approved',
    entityType: 'ServiceEstimate',
    entityId: estimateId,
    metadata: { serviceNumber: estimate.vehicleService.serviceNumber },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'service_estimate.approved',
    entityType: 'VehicleService',
    entityId: estimate.vehicleService.id,
    metadata: { serviceNumber: estimate.vehicleService.serviceNumber },
  });

  try {
    const formatNaira = (value: number) => `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const total = estimate.lineItems.reduce((sum: number, li: { amount: unknown }) => sum + Number(li.amount ?? 0), 0);
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const vehicleDescription = [estimate.vehicleService.vehicle.make, estimate.vehicleService.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
    await sendEmail(
      estimate.vehicleService.customer.email,
      `Your estimate for Vehicle Service ${estimate.vehicleService.serviceNumber} has been approved`,
      renderCustomerServiceEstimateApprovedEmail({
        customerName: estimate.vehicleService.customer.fullName,
        serviceNumber: estimate.vehicleService.serviceNumber,
        vehicleDescription,
        lineItems: (estimate.lineItems as { description: string; quantity: unknown; amount: unknown; unitOfMeasure: string | null }[]).map((li) => ({
          description: li.description,
          quantity: Number(li.quantity),
          unitOfMeasure: li.unitOfMeasure,
          amount: formatNaira(Number(li.amount ?? 0)),
        })),
        totalAmount: formatNaira(total),
        serviceUrl: `${portalUrl}/workshop/vehicle-service/${estimate.vehicleService.id}`,
        logoUrl: `${portalUrl}/images/logo/logo.png`,
        companyName: estimate.vehicleService.branch.businessUnit.organisation.name,
        branchName: estimate.vehicleService.branch.name,
      }),
      await (async () => {
        // The real, styled PDF attachment — reuses Job Card's own
        // exact PDF layout component (EstimatePdf), just with its
        // reference label parameterized to say "VEHICLE SERVICE"
        // instead of the default "JOB CARD" — everything else about
        // the document, including the real minimum-deposit section
        // now that Vehicle Service has its own real payment system,
        // is identical.
        try {
          const org = estimate.vehicleService.branch.businessUnit.organisation;
          const formatNairaForPdf = (value: number) => `NGN ${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const minimumDeposit = Math.round(total * MINIMUM_DEPOSIT_FRACTION * 100) / 100;
          const paymentRemarkSuggestion = `${estimate.vehicleService.serviceNumber} Deposit`;
          const pdfBuffer = await renderToBuffer(
            EstimatePdf({
              organisation: {
                name: org.name,
                legalName: org.legalName,
                hqAddress: org.hqAddress,
                poBox: org.poBox,
                rcNumber: org.rcNumber,
                hotlines: org.hotlines,
                website: org.website,
                email: org.email,
              },
              branch: {
                name: estimate.vehicleService.branch.name,
                address: estimate.vehicleService.branch.address,
                hotlines: estimate.vehicleService.branch.hotlines,
                email: estimate.vehicleService.branch.email,
              },
              logoUrl: `${portalUrl}/images/logo/logo.png`,
              jobNumber: estimate.vehicleService.serviceNumber,
              referenceLabel: 'VEHICLE SERVICE',
              customerName: estimate.vehicleService.customer.fullName,
              customerAddress: estimate.vehicleService.customer.address,
              vehicleDescription: [estimate.vehicleService.vehicle.year, estimate.vehicleService.vehicle.make, estimate.vehicleService.vehicle.model].filter(Boolean).join(' ') || vehicleDescription,
              plateNumber: estimate.vehicleService.vehicle.plateNumber,
              chassisNumber: estimate.vehicleService.vehicle.chassisNumber,
              lineItems: estimate.lineItems.map((li: { description: string; quantity: unknown; amount: unknown; unitOfMeasure: string | null }) => ({
                description: li.description,
                quantity: Number(li.quantity),
                unitLabel: li.unitOfMeasure ? pluralizeWord(Number(li.quantity), li.unitOfMeasure) : null,
                amount: formatNairaForPdf(Number(li.amount ?? 0)),
              })),
              servicesSubtotal: null,
              labourSubtotal: null,
              sundrySubtotal: null,
              totalAmount: formatNairaForPdf(total),
              minimumDepositAmount: formatNairaForPdf(minimumDeposit),
              bankName: COMPANY_BANK_DETAILS.bankName,
              accountName: COMPANY_BANK_DETAILS.accountName,
              accountNumber: COMPANY_BANK_DETAILS.accountNumber,
              paymentRemarkSuggestion,
            }),
          );
          return [{ filename: `Estimate-${estimate.vehicleService.serviceNumber}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }];
        } catch (pdfErr) {
          // A failed PDF must never block the email itself — the
          // customer still needs the approval notice either way.
          // eslint-disable-next-line no-console
          console.error('Failed to generate Vehicle Service estimate PDF attachment', estimate.vehicleService.serviceNumber, pdfErr);
          return undefined;
        }
      })(),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send customer estimate-approved email for Vehicle Service', estimate.vehicleService.serviceNumber, err);
  }
}

export async function getServiceEstimate(vehicleServiceId: string) {
  await requireUser();
  return prisma.serviceEstimate.findUnique({
    where: { vehicleServiceId },
    include: {
      createdBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
      lineItems: { orderBy: { createdAt: 'asc' }, include: { enteredBy: { select: { fullName: true } } } },
    },
  });
}
