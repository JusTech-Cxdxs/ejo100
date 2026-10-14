/**
 * Aftercare: warranties about to end, open warranty claims and their
 * deadlines (warranty.view, fenced to the organisation's customers like the
 * Warranty pages), and vehicles due a service (the Service tracker's own
 * reader, fenced to the person's workshop branch).
 */
import { prisma } from '@ejo/database';
import { allows, orgWhere } from '@/lib/authz/server';
import { listVehiclesDueForService } from '@/lib/actions/vehicle-service';
import { getWorkshopBranchId } from '@/lib/workshop-core';
import { day, money, ok, refused, STATUS_WORDS } from '../tool-helpers';
import type { StaffTool } from '../types';

const OPEN_CLAIMS = ['DRAFT', 'PENDING_HOD', 'PENDING_MANAGER', 'APPROVED_TO_SUBMIT', 'SUBMITTED', 'ACCEPTED', 'PARTIALLY_ACCEPTED'] as const;
const DAY = 86_400_000;

export const aftercareTools: StaffTool[] = [
  {
    name: 'warranty_watch',
    kind: 'read',
    status: 'Checking warranties and claims…',
    description:
      'Warranty watch: active warranties ending within the next N days (default 30), warranties waiting for verification, and open warranty claims with their deadlines (overdue and due within 7 days first), with links.',
    parameters: {
      type: 'object',
      properties: { days: { type: 'integer', minimum: 1, maximum: 365, description: 'How far ahead to look for warranties ending (default 30).' } },
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('warranty.view'))) return refused('warranties and claims are for Warranty staff, the Workshop Manager and administrators.');
      const days = typeof args.days === 'number' ? args.days : 30;
      const now = new Date();
      const customer = await orgWhere();
      const [ending, pending, claims] = await Promise.all([
        prisma.warranty.findMany({
          where: { customer, status: 'ACTIVE', endsAt: { gte: now, lte: new Date(now.getTime() + days * DAY) } },
          orderBy: { endsAt: 'asc' },
          take: 15,
          select: { id: true, warrantyNumber: true, subjectDescription: true, endsAt: true, customer: { select: { fullName: true } }, vehicle: { select: { plateNumber: true } } },
        }),
        prisma.warranty.count({ where: { customer, status: 'PENDING_VERIFICATION' } }),
        prisma.warrantyClaim.findMany({
          where: { customer, status: { in: [...OPEN_CLAIMS] } },
          orderBy: [{ deadlineAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
          take: 30,
          select: { id: true, claimNumber: true, status: true, causalPart: true, deadlineAt: true, claimedAmount: true, provider: { select: { name: true } }, customer: { select: { fullName: true } } },
        }),
      ]);
      const left = (d: Date | null) => (d ? Math.ceil((new Date(d).getTime() - now.getTime()) / DAY) : null);
      const claimRows = claims.map((c) => {
        const daysLeft = left(c.deadlineAt);
        return {
          number: c.claimNumber, status: STATUS_WORDS(c.status), part: c.causalPart, provider: c.provider.name, customer: c.customer.fullName, claimed: money(c.claimedAmount),
          deadline: day(c.deadlineAt), daysToDeadline: daysLeft, urgency: daysLeft === null ? 'No deadline' : daysLeft < 0 ? 'Deadline passed' : daysLeft <= 7 ? 'Due within 7 days' : 'On time',
          href: `/warranty/claims/${c.id}`,
        };
      });
      return ok({
        endingWithinDays: days,
        ending: { count: ending.length, items: ending.map((w) => ({ number: w.warrantyNumber, covers: w.subjectDescription, customer: w.customer.fullName, plate: w.vehicle?.plateNumber ?? null, ends: day(w.endsAt), daysLeft: left(w.endsAt), href: `/warranty/${w.id}` })) },
        awaitingVerification: pending,
        openClaims: {
          count: claimRows.length,
          deadlinePassed: claimRows.filter((c) => c.urgency === 'Deadline passed').length,
          dueWithin7Days: claimRows.filter((c) => c.urgency === 'Due within 7 days').length,
          items: claimRows.slice(0, 15),
        },
      }, [{ label: 'Warranty', href: '/warranty' }, { label: 'Warranty claims', href: '/warranty/claims' }]);
    },
  },
  {
    name: 'service_due',
    kind: 'read',
    status: 'Checking which vehicles are due a service…',
    description:
      'Vehicles at this person\'s workshop that are overdue or due soon for their next service (from the Service tracker): owner, plate, due date or odometer, days or km left, whether it is already back in the workshop, and whether a reminder can be sent now.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      if (!(await allows('workshop.job_card.view'))) return refused('the Service tracker is for the workshop and management.');
      const due = await listVehiclesDueForService(await getWorkshopBranchId());
      const crm = await allows('crm.view');
      const rows = due.slice(0, 20).map((v) => ({
        vehicle: v.vehicleDescription, plate: v.plateNumber, customer: v.customerName, ...(crm && v.customerId ? { customerHref: `/crm/customers/${v.customerId}` } : {}),
        status: v.status === 'OVERDUE' ? 'Overdue' : 'Due soon', dueDate: day(v.nextServiceDueDate), dueOdometer: v.nextServiceDueOdometer, daysLeft: v.daysRemaining, kmLeft: v.kmRemaining,
        inWorkshopNow: v.inWorkshop ? v.inWorkshop.number : null, remindersSentThisCycle: v.remindersSentThisCycle, reminderCanBeSentNow: Boolean(v.reminderDue),
        href: `/workshop/vehicles/${v.vehicleId}/edit`,
      }));
      return ok({
        overdue: due.filter((v) => v.status === 'OVERDUE').length,
        dueSoon: due.filter((v) => v.status === 'DUE_SOON').length,
        vehicles: rows,
      }, [{ label: 'Service tracker', href: '/workshop/service-tracker' }]);
    },
  },
];
