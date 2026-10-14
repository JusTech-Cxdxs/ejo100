/**
 * Records: the global search, Job Cards, Vehicle Services, customers and a
 * vehicle's history. Every read goes through the module's own reader
 * (getJobCard, getVehicleService, getCustomer360, globalSearch …), which
 * fences by branch and organisation exactly as the pages do. A record the
 * person may not see is reported as "not found", never as "exists".
 */
import { prisma } from '@ejo/database';
import { allows, getPrincipal, orgWhere, reachWhere } from '@/lib/authz/server';
import { globalSearch, type SearchGroup } from '@/lib/actions/search';
import { getJobCard } from '@/lib/actions/workshop';
import { getVehicleService } from '@/lib/actions/vehicle-service';
import { getServiceEstimate } from '@/lib/actions/vehicle-service-estimate';
import { getVehicleServicePayments } from '@/lib/actions/vehicle-service-payment';
import { listRefunds } from '@/lib/actions/refunds';
import { getCustomer360, searchCrmCustomers } from '@/lib/actions/crm';
import { listPartsFittedToVehicle } from '@/lib/actions/vehicle-history';
import { BILL_TO_LABEL, billingSplit, type BillTo } from '@/lib/estimate-billing';
import { MINIMUM_DEPOSIT_FRACTION } from '@/lib/workshop-constants';
import { nextStep, paymentPosition } from '../next-step';
import { day, money, nothing, ok, r2, refused, STATUS_WORDS, text } from '../tool-helpers';
import type { StaffTool } from '../types';

const CUID = /^c[a-z0-9]{20,32}$/;

type Resolved = { id: string } | { candidates: { label: string; sub?: string; href: string }[] } | null;

/** A reference typed by a person ("JC-2026-000412", "412", an id) → the record id, through the fenced search. */
async function resolve(input: string, prefix: 'JC' | 'SV', group: string, base: string): Promise<Resolved> {
  const q = input.trim().toUpperCase();
  if (CUID.test(input.trim())) return { id: input.trim() };
  if (new RegExp(`^${prefix}-\\d{4}-\\d{6}$`).test(q)) {
    const row = prefix === 'JC'
      ? await prisma.jobCard.findUnique({ where: { jobNumber: q }, select: { id: true } })
      : await prisma.vehicleService.findUnique({ where: { serviceNumber: q }, select: { id: true } });
    return row ? { id: row.id } : null;
  }
  // Partial numbers, plates and names: the header search, with the person's own reach.
  const groups: SearchGroup[] = await globalSearch(input);
  const hits = groups.find((g) => g.group === group)?.hits ?? [];
  if (hits.length === 1) return { id: hits[0]!.href.slice(base.length) };
  if (hits.length > 1) return { candidates: hits.map((h) => ({ label: h.label, sub: h.sub, href: h.href })) };
  return null;
}

const person = (u: { fullName: string } | null | undefined) => u?.fullName ?? null;
const vehicleLabel = (v: { make: string | null; model: string | null; year: number | null } | null | undefined) => (v ? [v.year, v.make, v.model].filter(Boolean).join(' ') || null : null);

export const recordTools: StaffTool[] = [
  {
    name: 'search_records',
    kind: 'read',
    status: 'Searching the records…',
    description:
      'Find any record by reference number (JC-, SV-, PRS-, EPR-, GRN-, RF-, WR-, WC-, VIS-, EP-, VX-, RT-, INC-, DLV-, CTR-, APT-, BC-), plate, VIN, customer name, phone or part number. Returns grouped hits with links, only what this person may open.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'A reference, plate, name, phone or part number.', minLength: 1, maxLength: 100 } },
      required: ['query'],
      additionalProperties: false,
    },
    run: async (args) => {
      const groups = await globalSearch(text(args.query, 100));
      if (!groups.length) return nothing('Nothing found that this person can open. Suggest checking the spelling or the number.');
      const trimmed = groups.slice(0, 8).map((g) => ({ group: g.group, hits: g.hits.slice(0, 5).map((h) => ({ label: h.label, ...(h.sub ? { detail: h.sub } : {}), href: h.href })) }));
      return ok({ groups: trimmed }, trimmed.flatMap((g) => g.hits.slice(0, 1).map((h) => ({ label: h.label, href: h.href }))).slice(0, 5));
    },
  },
  {
    name: 'job_card_details',
    kind: 'read',
    status: 'Opening the Job Card…',
    description:
      'Everything about one Job Card: status, approval, customer, vehicle, complaints, diagnosis, supervisor and technician, the estimate (status, lines, customer total), payments, balance and the next step, with a link. Takes a Job Card number (JC-2026-000412), part of it, a plate or a customer name.',
    parameters: {
      type: 'object',
      properties: { reference: { type: 'string', description: 'Job Card number (e.g. JC-2026-000412), part of it, or a plate.', minLength: 2, maxLength: 60 } },
      required: ['reference'],
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('workshop.job_card.view'))) return refused('Job Cards are for the workshop, the Store, Finance, Warranty and management.');
      const r = await resolve(text(args.reference, 60), 'JC', 'Job Cards', '/workshop/job-cards/');
      if (!r) return nothing('No Job Card with that reference that this person can open.');
      if ('candidates' in r) return ok({ matches: r.candidates, note: 'Several Job Cards match. Ask which one.' });
      const jc = await getJobCard(r.id);
      if (!jc) return nothing('No Job Card with that reference that this person can open.');
      const crm = await allows('crm.view');
      const lines = jc.estimate?.lineItems ?? [];
      const split = billingSplit(lines);
      const paidIn = r2(jc.payments.reduce((s: number, p: { amount: unknown }) => s + Number(p.amount), 0));
      const refunded = r2(jc.refunds.reduce((s: number, x: { amount: unknown }) => s + Number(x.amount), 0));
      const netPaid = r2(paidIn - refunded);
      const pos = paymentPosition(split.customer, netPaid, MINIMUM_DEPOSIT_FRACTION);
      const complaints = jc.complaints.length ? jc.complaints.map((c: { description: string }) => c.description) : jc.complaint ? [jc.complaint] : [];
      const href = `/workshop/job-cards/${jc.id}`;
      return ok({
        number: jc.jobNumber,
        href,
        status: STATUS_WORDS(jc.status),
        approval: jc.approvalStatus === 'REJECTED' ? `Rejected: ${jc.rejectionReason ?? ''}`.trim() : STATUS_WORDS(jc.approvalStatus),
        branch: jc.branch?.name ?? null,
        opened: day(jc.createdAt),
        openedBy: person(jc.createdBy),
        customer: { name: jc.customer.fullName, ...(crm ? { href: `/crm/customers/${jc.customerId}` } : {}) },
        vehicle: { plate: jc.vehicle.plateNumber, description: vehicleLabel(jc.vehicle), mileageAtCheckIn: jc.mileageAtCheckIn, href: `/workshop/vehicles/${jc.vehicleId}/edit` },
        complaints,
        diagnosis: jc.diagnosis ?? null,
        supervisor: person(jc.supervisor),
        technician: person(jc.assignedTechnician),
        technicianResponse: jc.technicianAcceptanceStatus ? STATUS_WORDS(jc.technicianAcceptanceStatus) : null,
        estimate: jc.estimate
          ? {
              status: STATUS_WORDS(jc.estimate.status),
              customerNotified: Boolean(jc.estimate.customerNotifiedAt),
              lines: lines.slice(0, 20).map((l: { type: string; description: string; quantity: number; amount: unknown; billTo: string }) => ({
                type: STATUS_WORDS(l.type), description: l.description, quantity: l.quantity, amount: l.amount === null ? null : money(l.amount), ...(l.billTo !== 'CUSTOMER' ? { paidBy: BILL_TO_LABEL[l.billTo as BillTo] } : {}),
              })),
              lineCount: lines.length,
              customerTotal: split.customer,
              notChargedToCustomer: split.covered,
            }
          : null,
        payments: { paidIn, refunded, netPaid, balance: pos.balance, position: pos.label, minimumDeposit: r2(split.customer * MINIMUM_DEPOSIT_FRACTION) },
        nextStep: nextStep({
          kind: 'JC', status: jc.status, approvalStatus: jc.approvalStatus, hasTechnician: Boolean(jc.assignedTechnicianId), technicianAccepted: jc.technicianAcceptanceStatus ?? null,
          estimateStatus: jc.estimate?.status ?? null, customerNotified: Boolean(jc.estimate?.customerNotifiedAt), total: split.customer, paid: netPaid, depositFraction: MINIMUM_DEPOSIT_FRACTION,
        }),
        ...(jc.escalatedFromVehicleService ? { escalatedFrom: { number: jc.escalatedFromVehicleService.serviceNumber, href: `/workshop/vehicle-service/${jc.escalatedFromVehicleService.id}` } } : {}),
      }, [{ label: jc.jobNumber, href }]);
    },
  },
  {
    name: 'vehicle_service_details',
    kind: 'read',
    status: 'Opening the Vehicle Service…',
    description:
      'Everything about one Vehicle Service: status, approval, customer, vehicle, what the customer asked for, technician notes, supervisor and technician, the estimate, payments, balance, next service due and the next step, with a link. Takes an SV number (SV-2026-000031), part of it, or a plate.',
    parameters: {
      type: 'object',
      properties: { reference: { type: 'string', description: 'Vehicle Service number (e.g. SV-2026-000031), part of it, or a plate.', minLength: 2, maxLength: 60 } },
      required: ['reference'],
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('workshop.job_card.view'))) return refused('Vehicle Services are for the workshop, the Store, Finance, Warranty and management.');
      const r = await resolve(text(args.reference, 60), 'SV', 'Vehicle Services', '/workshop/vehicle-service/');
      if (!r) return nothing('No Vehicle Service with that reference that this person can open.');
      if ('candidates' in r) return ok({ matches: r.candidates, note: 'Several Vehicle Services match. Ask which one.' });
      const sv = await getVehicleService(r.id);
      if (!sv) return nothing('No Vehicle Service with that reference that this person can open.');
      const [estimate, payments, refunds, crm] = await Promise.all([getServiceEstimate(sv.id), getVehicleServicePayments(sv.id), listRefunds({ vehicleServiceId: sv.id }), allows('crm.view')]);
      const lines = estimate?.lineItems ?? [];
      const total = r2(lines.reduce((s: number, l: { amount: unknown }) => s + (l.amount === null ? 0 : Number(l.amount)), 0));
      const paidIn = r2(payments.reduce((s: number, p: { amount: unknown }) => s + Number(p.amount), 0));
      const refunded = r2(refunds.reduce((s: number, x: { amount: unknown }) => s + Number(x.amount), 0));
      const netPaid = r2(paidIn - refunded);
      const pos = paymentPosition(total, netPaid, MINIMUM_DEPOSIT_FRACTION);
      const href = `/workshop/vehicle-service/${sv.id}`;
      const asked = sv.complaints.length ? sv.complaints.map((c: { description: string }) => c.description) : sv.customerComplaint ? [sv.customerComplaint] : [];
      return ok({
        number: sv.serviceNumber,
        href,
        status: STATUS_WORDS(sv.status),
        approval: sv.approvalStatus === 'REJECTED' ? `Rejected: ${sv.rejectionReason ?? ''}`.trim() : STATUS_WORDS(sv.approvalStatus),
        branch: sv.branch?.name ?? null,
        opened: day(sv.createdAt),
        customer: { name: sv.customer.fullName, ...(crm ? { href: `/crm/customers/${sv.customerId}` } : {}) },
        vehicle: { plate: sv.vehicle.plateNumber, description: vehicleLabel(sv.vehicle), odometer: sv.odometerAtService, href: `/workshop/vehicles/${sv.vehicleId}/edit` },
        customerAskedFor: asked,
        technicianNotes: sv.technicianNotes ?? null,
        supervisor: person(sv.supervisor),
        technician: person(sv.assignedTechnician),
        technicianResponse: sv.technicianAcceptanceStatus ? STATUS_WORDS(sv.technicianAcceptanceStatus) : null,
        estimate: estimate
          ? { status: STATUS_WORDS(estimate.status), customerNotified: Boolean(estimate.customerNotifiedAt), lines: lines.slice(0, 20).map((l: { type: string; description: string; quantity: unknown; amount: unknown }) => ({ type: STATUS_WORDS(l.type), description: l.description, quantity: Number(l.quantity), amount: l.amount === null ? null : money(l.amount) })), lineCount: lines.length, total }
          : null,
        payments: { paidIn, refunded, netPaid, balance: pos.balance, position: pos.label },
        nextServiceDue: sv.nextServiceDueDate || sv.nextServiceDueOdometer ? { date: day(sv.nextServiceDueDate), odometer: sv.nextServiceDueOdometer } : null,
        nextStep: nextStep({
          kind: 'SV', status: sv.status, approvalStatus: sv.approvalStatus, hasTechnician: Boolean(sv.assignedTechnicianId), technicianAccepted: sv.technicianAcceptanceStatus ?? null,
          estimateStatus: estimate?.status ?? null, customerNotified: Boolean(estimate?.customerNotifiedAt), total, paid: netPaid, depositFraction: MINIMUM_DEPOSIT_FRACTION,
        }),
        ...(sv.escalatedToJobCard ? { escalatedTo: { number: sv.escalatedToJobCard.jobNumber, href: `/workshop/job-cards/${sv.escalatedToJobCard.id}` } } : {}),
      }, [{ label: sv.serviceNumber, href }]);
    },
  },
  {
    name: 'customer_profile',
    kind: 'read',
    status: 'Opening the customer…',
    description:
      'A customer\'s summary from Customers (CRM): contact details, vehicles, number of jobs, lifetime spend (net of refunds), amount outstanding, last visit, open jobs and warranties, with a link. Takes a name, phone, email or plate. Needs access to Customers.',
    parameters: {
      type: 'object',
      properties: { customer: { type: 'string', description: 'Customer name, phone, email or one of their plates.', minLength: 2, maxLength: 100 } },
      required: ['customer'],
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('crm.view'))) return refused('customer profiles are for the front desk, the Workshop Manager and administrators (Customers).');
      const q = text(args.customer, 100);
      const found = CUID.test(q) ? [{ id: q, fullName: '', email: '', phone: null }] : await searchCrmCustomers(q);
      if (!found.length) return nothing('No customer of this organisation matches that.');
      if (found.length > 1) return ok({ matches: found.slice(0, 8).map((c) => ({ name: c.fullName, phone: c.phone, href: `/crm/customers/${c.id}` })), note: 'Several customers match. Ask which one.' });
      const c = await getCustomer360(found[0]!.id);
      if (!c) return nothing('No customer of this organisation matches that.');
      const href = `/crm/customers/${c.customer.id}`;
      const open = c.jobs.filter((j) => j.open);
      return ok({
        name: c.customer.fullName,
        href,
        type: STATUS_WORDS(c.customer.customerType),
        phone: c.customer.phone,
        altPhone: c.customer.altPhone,
        email: c.customer.email,
        address: c.customer.address,
        tags: c.customer.tags,
        portal: { access: c.customer.isActive ? 'On' : 'Off', hasPassword: c.portal.hasAccount, lastSignIn: day(c.portal.lastSignIn) },
        vehicles: c.vehicles.slice(0, 10).map((v) => ({ plate: v.plateNumber, description: vehicleLabel(v), jobs: v.jobs, lastVisit: day(v.lastVisit), href: `/workshop/vehicles/${v.id}/edit` })),
        jobsCount: c.jobs.length,
        openJobs: open.slice(0, 8).map((j) => ({ number: j.number, status: STATUS_WORDS(j.status), href: j.href })),
        money: { lifetimeSpendNet: c.money.netPaid, spendThisYearNet: c.money.netPaidThisYear, outstanding: c.money.outstanding, averageJob: c.money.averageJob },
        lastVisit: day(c.money.lastVisit),
        visits: c.money.visits,
        activeWarranties: c.money.activeWarranties,
        scope: c.scope.branchOnly ? `Visits and money for ${c.scope.branchName} only` : 'Whole organisation',
      }, [{ label: c.customer.fullName, href }]);
    },
  },
  {
    name: 'vehicle_history',
    kind: 'read',
    status: 'Reading the vehicle\'s history…',
    description:
      'A vehicle\'s workshop history by plate or VIN: past Job Cards and Vehicle Services (newest first) with the complaints, diagnosis, technician notes, work and parts on the estimate, inspection findings that needed attention, and parts fitted. Use for diagnosis ("has this car had this problem before?").',
    parameters: {
      type: 'object',
      properties: { vehicle: { type: 'string', description: 'Plate number or VIN (chassis number).', minLength: 3, maxLength: 40 } },
      required: ['vehicle'],
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('workshop.job_card.view'))) return refused('vehicle histories are for the workshop and management.');
      const raw = text(args.vehicle, 40);
      const plate = raw.toUpperCase().replace(/\s+/g, ' ');
      const vin = raw.toUpperCase().replace(/\s+/g, '');
      const vehicle = await prisma.customerVehicle.findFirst({
        where: { customer: await orgWhere(), OR: [{ plateNumber: { equals: plate, mode: 'insensitive' } }, { plateNumber: { equals: vin, mode: 'insensitive' } }, { chassisNumber: { equals: vin, mode: 'insensitive' } }] },
        select: { id: true, plateNumber: true, chassisNumber: true, make: true, model: true, year: true, mileage: true, engineType: true, customer: { select: { fullName: true } } },
      });
      if (!vehicle) return nothing('No vehicle of this organisation has that plate or VIN.');
      const reach = await reachWhere('workshop.job_card.view');
      const [jcs, svs, fitted] = await Promise.all([
        prisma.jobCard.findMany({
          where: { vehicleId: vehicle.id, ...reach },
          orderBy: { createdAt: 'desc' },
          take: 15,
          select: {
            id: true, jobNumber: true, status: true, createdAt: true, mileageAtCheckIn: true, complaint: true, diagnosis: true,
            complaints: { orderBy: { sequenceNumber: 'asc' }, select: { description: true } },
            assignedTechnician: { select: { fullName: true } },
            estimate: { select: { lineItems: { orderBy: { createdAt: 'asc' }, take: 25, select: { type: true, description: true, quantity: true } } } },
          },
        }),
        prisma.vehicleService.findMany({
          where: { vehicleId: vehicle.id, ...reach },
          orderBy: { createdAt: 'desc' },
          take: 15,
          select: {
            id: true, serviceNumber: true, status: true, createdAt: true, odometerAtService: true, customerComplaint: true, technicianNotes: true,
            complaints: { orderBy: { sequenceNumber: 'asc' }, select: { description: true } },
            assignedTechnician: { select: { fullName: true } },
            serviceEstimate: { select: { lineItems: { orderBy: { createdAt: 'asc' }, take: 25, select: { type: true, description: true } } } },
            inspection: { select: { status: true, items: { where: { severity: { in: ['ATTENTION', 'SERVICE_REQUIRED', 'CRITICAL'] } }, take: 15, select: { section: true, name: true, severity: true, condition: true, action: true } } } },
          },
        }),
        listPartsFittedToVehicle(vehicle.id).catch(() => []),
      ]);
      type V = { kind: string; number: string; date: Date; href: string; [k: string]: unknown };
      const visits: V[] = [
        ...jcs.map((j) => ({
          kind: 'Job Card', number: j.jobNumber, date: j.createdAt, href: `/workshop/job-cards/${j.id}`, status: STATUS_WORDS(j.status), mileage: j.mileageAtCheckIn,
          complaints: j.complaints.length ? j.complaints.map((c) => c.description) : j.complaint ? [j.complaint] : [],
          diagnosis: j.diagnosis ?? undefined, technician: j.assignedTechnician?.fullName ?? undefined,
          work: (j.estimate?.lineItems ?? []).map((l) => `${STATUS_WORDS(l.type)}: ${l.description}${l.quantity > 1 ? ` × ${l.quantity}` : ''}`),
        })),
        ...svs.map((v) => ({
          kind: 'Vehicle Service', number: v.serviceNumber, date: v.createdAt, href: `/workshop/vehicle-service/${v.id}`, status: STATUS_WORDS(v.status), mileage: v.odometerAtService,
          complaints: v.complaints.length ? v.complaints.map((c) => c.description) : v.customerComplaint ? [v.customerComplaint] : [],
          technicianNotes: v.technicianNotes ?? undefined, technician: v.assignedTechnician?.fullName ?? undefined,
          work: (v.serviceEstimate?.lineItems ?? []).map((l) => `${STATUS_WORDS(l.type)}: ${l.description}`),
          findings: (v.inspection?.items ?? []).map((i) => `${i.section} — ${i.name}: ${STATUS_WORDS(i.severity ?? '')}${i.condition ? ` (${i.condition})` : ''}${i.action ? `, action: ${i.action}` : ''}`),
        })),
      ].sort((a, b) => +b.date - +a.date);
      const principal = await getPrincipal();
      return ok({
        vehicle: { plate: vehicle.plateNumber, vin: vehicle.chassisNumber, description: vehicleLabel(vehicle), engine: vehicle.engineType, mileage: vehicle.mileage, owner: vehicle.customer.fullName, href: `/workshop/vehicles/${vehicle.id}/edit` },
        visits: visits.slice(0, 20).map(({ date, ...v }) => ({ ...v, date: day(date) })),
        visitCount: visits.length,
        partsFitted: fitted.slice(0, 15).map((l) => ({ part: l.part.name, partNumber: l.part.partNumber, quantity: Number(l.quantityReleased), on: l.slip.jobCard?.jobNumber ?? l.slip.vehicleService?.serviceNumber ?? null, date: day(l.slip.releasedAt) })),
        ...(principal.branchId && typeof reach.branchId === 'string' ? { scope: 'Visits at this person\'s branch only.' } : {}),
      }, [{ label: vehicle.plateNumber ?? 'Vehicle', href: `/workshop/vehicles/${vehicle.id}/edit` }]);
    },
  },
];
