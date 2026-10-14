/**
 * Drafts never write. draft_job_card finds the customer and vehicle through
 * the front desk's own (organisation-fenced) pickers, then returns a link
 * that opens the normal Open Job Card form pre-filled. The person chooses the
 * supervisor, checks everything and presses "Open Job Card" themselves.
 */
import { prisma } from '@ejo/database';
import { allows, orgWhere } from '@/lib/authz/server';
import { listVehiclesForCustomer, searchCustomers } from '@/lib/actions/workshop';
import { jobCardPrefillHref, cleanLine, PREFILL_MAX_COMPLAINT_CHARS, PREFILL_MAX_COMPLAINTS } from '../prefill';
import { nothing, ok, refused, text } from '../tool-helpers';
import { draftResult, type StaffTool } from '../types';

const label = (v: { plateNumber: string | null; chassisNumber?: string | null; make: string | null; model: string | null; year: number | null }) =>
  `${[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}${v.plateNumber ? ` (${v.plateNumber})` : v.chassisNumber ? ` (${v.chassisNumber})` : ''}`;

export const draftTools: StaffTool[] = [
  {
    name: 'draft_job_card',
    kind: 'draft',
    status: 'Preparing the Job Card form…',
    description:
      'Front desk: prepare a new Job Card. Finds the customer (by plate, or by name/phone/email) and vehicle and returns a draft that opens the normal Open Job Card form pre-filled with the customer, vehicle, complaints and mileage. Nothing is saved: the person picks the supervisor and presses "Open Job Card". If several customers match, returns them so you can ask which.',
    parameters: {
      type: 'object',
      properties: {
        plate: { type: 'string', description: 'The vehicle\'s plate number or VIN, if known.', maxLength: 40 },
        customer: { type: 'string', description: 'Customer name, phone or email, if no plate is given.', maxLength: 100 },
        complaints: { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 5, description: 'What the customer reports, one item per problem, in plain words.' },
        mileage: { type: 'integer', minimum: 0, maximum: 2000000, description: 'Odometer reading at check-in, in km, if given.' },
      },
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('workshop.job_card.create'))) return refused('Job Cards are opened by the front desk.');
      const plate = text(args.plate, 40).toUpperCase();
      const who = text(args.customer, 100);
      const complaints = (Array.isArray(args.complaints) ? args.complaints : []).map((c) => cleanLine(String(c), PREFILL_MAX_COMPLAINT_CHARS)).filter(Boolean).slice(0, PREFILL_MAX_COMPLAINTS);
      const mileage = typeof args.mileage === 'number' ? args.mileage : undefined;
      if (!plate && !who) return nothing('Ask for the vehicle\'s plate or the customer\'s name or phone first.');

      let customer: { id: string; fullName: string } | null = null;
      let vehicle: { id: string; plateNumber: string | null; chassisNumber: string | null; make: string | null; model: string | null; year: number | null; vehicleType: string | null } | null = null;
      if (plate) {
        const v = await prisma.customerVehicle.findFirst({
          where: { customer: await orgWhere(), OR: [{ plateNumber: { equals: plate.replace(/\s+/g, ' '), mode: 'insensitive' } }, { chassisNumber: { equals: plate.replace(/\s+/g, ''), mode: 'insensitive' } }] },
          select: { id: true, plateNumber: true, chassisNumber: true, make: true, model: true, year: true, vehicleType: true, customer: { select: { id: true, fullName: true } } },
        });
        if (v) { vehicle = v; customer = v.customer; }
        else if (!who) return nothing(`No registered vehicle has the plate or VIN ${plate}. It must be registered first (Workshop → Vehicles → "Register vehicle"), or give the customer's name.`);
      }
      if (!customer) {
        const found = await searchCustomers(who);
        if (!found.length) return nothing('No customer matches that. The customer may need to be registered first.');
        if (found.length > 1) return ok({ matches: found.slice(0, 8).map((c) => ({ name: c.fullName, phone: c.phone })), note: 'Several customers match. Ask which one (or for the plate).' });
        customer = { id: found[0]!.id, fullName: found[0]!.fullName };
      }
      let vehicles: { id: string; plateNumber: string | null; chassisNumber: string | null; make: string | null; model: string | null; year: number | null; vehicleType: string | null }[] = [];
      if (!vehicle) {
        vehicles = await listVehiclesForCustomer(customer.id);
        if (vehicles.length === 1) vehicle = vehicles[0]!;
      }
      const lines = [
        `Customer: ${customer.fullName}`,
        vehicle ? `Vehicle: ${label(vehicle)}` : vehicles.length ? `Vehicle: choose one of ${vehicles.length} on the form` : 'Vehicle: none registered yet — register it first under Workshop → Vehicles',
        complaints.length ? `Complaints: ${complaints.map((c, i) => `${i + 1}. ${c}`).join(' ')}` : 'Complaints: add them on the form',
        ...(mileage !== undefined ? [`Mileage at check-in: ${mileage.toLocaleString('en-NG')} km`] : []),
        ...(vehicle && !vehicle.vehicleType ? ['This vehicle has no Passenger/Commercial type yet — set it on the vehicle page first.'] : []),
        'You choose the supervisor, check the details and press "Open Job Card". Nothing is saved until then.',
      ];
      return draftResult({
        kind: 'job_card',
        title: `New Job Card for ${customer.fullName}`,
        lines,
        href: jobCardPrefillHref({ customerId: customer.id, ...(vehicle ? { vehicleId: vehicle.id } : {}), complaints, ...(mileage !== undefined ? { mileage } : {}) }),
        confirmLabel: 'Open the form',
      });
    },
  },
];
