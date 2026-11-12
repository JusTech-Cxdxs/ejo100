/**
 * What goes into each customer document, worked out in one place (pure): the
 * estimate a customer is sent for a Job Card or a Vehicle Service, and the
 * inspection report. The email to the customer and the bulk copies for the
 * records (A4c2) are built from these, so a copy made later is the document
 * the customer was sent — the same lines, figures, deposit and bank details.
 *
 * The customer sees three figures: Parts & Services, Labour and Sundry —
 * never the internal line types. On a Job Card, lines covered by warranty,
 * goodwill or the business are never charged, and show what covers them.
 */
import { coveredLabel, isCustomerLine } from '../estimate-billing';
import { MINIMUM_DEPOSIT_FRACTION } from '../workshop-constants';
import { pluralizeWord } from '../utils/pluralize';
import type { EstimatePdfProps, InspectionPdfProps } from './document-types';

export type Letterhead = Pick<EstimatePdfProps, 'organisation' | 'branch' | 'logoUrl'>;
export type Bank = { bankName: string; accountName: string; accountNumber: string };

type Org = EstimatePdfProps['organisation'];
type Branch = EstimatePdfProps['branch'];
/** The letterhead from the organisation's and branch's own records, field by field (nothing else of theirs reaches a document). */
export function letterhead(org: Org, branch: Branch, portalUrl: string): Letterhead {
  return {
    organisation: { name: org.name, legalName: org.legalName, hqAddress: org.hqAddress, poBox: org.poBox, rcNumber: org.rcNumber, hotlines: org.hotlines, website: org.website, email: org.email },
    branch: { name: branch.name, address: branch.address, hotlines: branch.hotlines, email: branch.email },
    logoUrl: `${portalUrl.replace(/\/$/, '')}/images/logo/logo.png`,
  };
}

/** Helvetica (the PDF default) has no ₦ glyph, and embedding a font would make every document depend on fetching it, so PDFs say "NGN". */
export const nairaForPdf = (value: number) => `NGN ${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const minimumDepositOf = (total: number) => Math.round(total * MINIMUM_DEPOSIT_FRACTION * 100) / 100;

type Vehicle = { make: string | null; model: string | null; year?: number | null; plateNumber: string | null; chassisNumber: string | null };
type Customer = { fullName: string; address: string | null };

const JOB_SERVICES = new Set(['STORE_PART', 'EXTERNAL_PART', 'EXTERNAL_JOB', 'INTERNAL_JOB']);
export type JobEstimateLine = { type: string; description: string; quantity: unknown; amount: unknown; unitOfMeasure: string | null; billTo?: string | null; coveringWarranty?: { warrantyNumber: string } | null };

/** A Job Card estimate's customer figures: only lines the customer pays count. */
export function jobEstimateTotals(lines: { type: string; amount: unknown; billTo?: string | null }[]) {
  let services = 0, labour = 0, sundry = 0;
  for (const li of lines) {
    if (!isCustomerLine(li)) continue;
    const amount = Number(li.amount ?? 0);
    if (li.type === 'LABOUR') labour += amount;
    else if (li.type === 'SUNDRY') sundry += amount;
    else if (JOB_SERVICES.has(li.type)) services += amount;
  }
  const total = services + labour + sundry;
  return { services, labour, sundry, total, minimumDeposit: minimumDepositOf(total) };
}

export function jobEstimatePdfProps(p: { letterhead: Letterhead; bank: Bank; jobNumber: string; customer: Customer; vehicle: Vehicle; lineItems: JobEstimateLine[] }): EstimatePdfProps {
  const t = jobEstimateTotals(p.lineItems);
  const vehicleDescription = [p.vehicle.make, p.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
  return {
    ...p.letterhead,
    jobNumber: p.jobNumber,
    customerName: p.customer.fullName,
    customerAddress: p.customer.address,
    vehicleDescription,
    plateNumber: p.vehicle.plateNumber,
    chassisNumber: p.vehicle.chassisNumber,
    lineItems: p.lineItems.map((li) => ({
      description: li.description,
      quantity: Number(li.quantity),
      unitLabel: li.unitOfMeasure ? pluralizeWord(Number(li.quantity), li.unitOfMeasure) : null,
      amount: isCustomerLine(li) ? nairaForPdf(Number(li.amount ?? 0)) : coveredLabel(li.billTo, li.coveringWarranty?.warrantyNumber),
    })),
    servicesSubtotal: t.services > 0 ? nairaForPdf(t.services) : null,
    labourSubtotal: t.labour > 0 ? nairaForPdf(t.labour) : null,
    sundrySubtotal: t.sundry > 0 ? nairaForPdf(t.sundry) : null,
    totalAmount: nairaForPdf(t.total),
    minimumDepositAmount: nairaForPdf(t.minimumDeposit),
    ...p.bank,
    // Payment reference: number, vehicle, plate.
    paymentRemarkSuggestion: [p.jobNumber, vehicleDescription, p.vehicle.plateNumber].filter(Boolean).join(' '),
  };
}

export type ServiceEstimateLine = { type: string; description: string; quantity: unknown; amount: unknown; unitOfMeasure: string | null };

/** A Vehicle Service estimate's customer figures: Labour, Sundry, and everything else as Parts & Services. */
export function serviceEstimateTotals(lines: { type: string; amount: unknown }[]) {
  let services = 0, labour = 0, sundry = 0;
  for (const li of lines) {
    const amount = Number(li.amount ?? 0);
    if (li.type === 'LABOUR') labour += amount;
    else if (li.type === 'SUNDRY') sundry += amount;
    else services += amount;
  }
  const total = lines.reduce((sum, li) => sum + Number(li.amount ?? 0), 0);
  return { services, labour, sundry, total, minimumDeposit: minimumDepositOf(total) };
}

const serviceVehicle = (v: Vehicle) => [v.year, v.make, v.model].filter(Boolean).join(' ') || [v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';

export function serviceEstimatePdfProps(p: { letterhead: Letterhead; bank: Bank; serviceNumber: string; customer: Customer; vehicle: Vehicle; lineItems: ServiceEstimateLine[] }): EstimatePdfProps {
  const t = serviceEstimateTotals(p.lineItems);
  return {
    ...p.letterhead,
    jobNumber: p.serviceNumber,
    referenceLabel: 'VEHICLE SERVICE',
    customerName: p.customer.fullName,
    customerAddress: p.customer.address,
    vehicleDescription: serviceVehicle(p.vehicle),
    plateNumber: p.vehicle.plateNumber,
    chassisNumber: p.vehicle.chassisNumber,
    lineItems: p.lineItems.map((li) => ({
      description: li.description,
      quantity: Number(li.quantity),
      unitLabel: li.unitOfMeasure ? pluralizeWord(Number(li.quantity), li.unitOfMeasure) : null,
      amount: nairaForPdf(Number(li.amount ?? 0)),
    })),
    servicesSubtotal: t.services > 0 ? nairaForPdf(t.services) : null,
    labourSubtotal: t.labour > 0 ? nairaForPdf(t.labour) : null,
    sundrySubtotal: t.sundry > 0 ? nairaForPdf(t.sundry) : null,
    totalAmount: nairaForPdf(t.total),
    minimumDepositAmount: nairaForPdf(t.minimumDeposit),
    ...p.bank,
    paymentRemarkSuggestion: [p.serviceNumber, [p.vehicle.make, p.vehicle.model].filter(Boolean).join(' ') || 'Vehicle', p.vehicle.plateNumber].filter(Boolean).join(' '),
  };
}

export type InspectionItem = { section: string; name: string; condition: string | null; severity: string | null; action: string | null };

/** The customer's inspection report: reviewed items only (the customer copy never lists what was not checked). */
export function inspectionPdfProps(p: { letterhead: Letterhead; serviceNumber: string; customerName: string; vehicle: Vehicle; inspectedByName: string; completedOnLabel: string; items: InspectionItem[] }): InspectionPdfProps {
  return {
    ...p.letterhead,
    serviceNumber: p.serviceNumber,
    customerName: p.customerName,
    vehicleDescription: serviceVehicle(p.vehicle),
    plateNumber: p.vehicle.plateNumber,
    chassisNumber: p.vehicle.chassisNumber,
    inspectedByName: p.inspectedByName,
    completedOnLabel: p.completedOnLabel,
    reviewedItems: p.items.filter((i) => i.severity).map((i) => ({ section: i.section, name: i.name, condition: i.condition, severity: i.severity, action: i.action })),
  };
}
