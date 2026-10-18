/**
 * Service Centre and Projects: what a serial's warranty says today, where a
 * service job is, and how a project is going — all through the modules' own
 * fenced readers (service.view / warranty.view / projects.view).
 */
import { prisma } from '@ejo/database';
import { allows, orgWhere, reachWhere } from '@/lib/authz/server';
import { getProductWarrantyBySerial } from '@/lib/actions/product-warranty';
import { getProject } from '@/lib/actions/projects';
import { COVERAGE_LABEL, SERVICE_JOB_STATUS_LABEL, SERVICE_KIND_LABEL, paidJobBalance, type ServiceJobStatus, type ServiceJobKind } from '@/lib/service-core';
import { PROJECT_STATUS_LABEL, MILESTONE_STATE_LABEL, milestoneState, type ProjectStatus } from '@/lib/projects-core';
import { day, money, ok, nothing, refused, text, STATUS_WORDS } from '../tool-helpers';
import type { StaffTool } from '../types';

export const serviceTools: StaffTool[] = [
  {
    name: 'warranty_by_serial',
    kind: 'read',
    status: 'Checking the warranty for that serial…',
    description:
      'Whether a unit (by serial number) is under product warranty today: the product, the customer it was sold to, the warranty number and end date, days left, and the kind of service job it would get (warranty or paid).',
    parameters: {
      type: 'object',
      properties: { serial: { type: 'string', minLength: 3, maxLength: 60, description: 'The serial number printed on the unit.' } },
      required: ['serial'],
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('warranty.view'))) return refused('warranty lookups are for Warranty and Service Centre staff.');
      const serial = text(args.serial, 60);
      if (!serial) return nothing('Give the serial number to look up.');
      const r = await getProductWarrantyBySerial(serial);
      if (!r || !r.found) return nothing(`No unit with serial ${serial} is in the system. It may be mistyped, or the unit was never recorded here.`);
      return ok({
        serial: r.serialNumber, product: r.productName, customer: r.customerName,
        today: COVERAGE_LABEL[r.coverage.state], covered: r.coverage.covered, daysLeft: r.coverage.daysLeft,
        warranty: r.coverage.warranty ? { number: r.coverage.warranty.warrantyNumber, ends: day(r.coverage.warranty.endsAt), href: `/warranty/${r.coverage.warranty.id}` } : null,
        serviceJobKind: SERVICE_KIND_LABEL[r.kind],
        allWarranties: r.warranties.map((w) => ({ number: w.warrantyNumber, status: STATUS_WORDS(w.status), policy: w.policyName, from: day(w.startsAt), to: day(w.endsAt) })),
      }, [{ label: 'Product warranties', href: '/service/warranties' }, { label: 'Open a service job', href: `/service/jobs/new?serial=${encodeURIComponent(r.serialNumber)}` }]);
    },
  },
  {
    name: 'service_job_status',
    kind: 'read',
    status: 'Looking up the service job…',
    description:
      'Where a service job is: by its number (SVC-…) or by the unit serial — status, kind, technician, what was found and done, parts used, quotation and balance on a paid repair, and the dates. Without a number or serial: the open jobs at the Service Centre by status.',
    parameters: {
      type: 'object',
      properties: {
        number: { type: 'string', maxLength: 30, description: 'The service job number, e.g. SVC-2026-000012.' },
        serial: { type: 'string', maxLength: 60, description: 'Or the unit serial (latest job for it).' },
      },
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('service.view'))) return refused('service jobs are for the Service Centre, the Warranty Manager and management.');
      const reach = await reachWhere('service.view');
      const number = text(args.number, 30);
      const serial = text(args.serial, 60);
      if (!number && !serial) {
        const rows = await prisma.serviceJob.groupBy({ by: ['status'], where: { ...reach, status: { in: ['OPEN', 'ASSIGNED', 'DIAGNOSED', 'AWAITING_PARTS', 'REPAIRING', 'QA', 'READY'] } }, _count: { _all: true } });
        return ok({ openByStatus: rows.map((r) => ({ status: SERVICE_JOB_STATUS_LABEL[r.status as ServiceJobStatus], count: r._count._all })) }, [{ label: 'Service jobs', href: '/service/jobs' }]);
      }
      const job = await prisma.serviceJob.findFirst({
        where: { ...reach, ...(number ? { number: { equals: number, mode: 'insensitive' } } : { serialNumber: { equals: serial, mode: 'insensitive' } }) },
        orderBy: { createdAt: 'desc' },
        select: { id: true, number: true, status: true, kind: true, productName: true, serialNumber: true, fault: true, diagnosis: true, resolution: true, quotedAmount: true, paidAmount: true, createdAt: true, assignedAt: true, repairedAt: true, qaAt: true, returnedAt: true, technicianId: true, customer: { select: { fullName: true } }, parts: { select: { quantity: true, part: { select: { name: true } } } } },
      });
      if (!job) return nothing(`No service job ${number || `for serial ${serial}`} within your reach.`);
      const tech = job.technicianId ? await prisma.user.findUnique({ where: { id: job.technicianId }, select: { fullName: true } }) : null;
      const quoted = job.quotedAmount === null ? null : money(job.quotedAmount);
      return ok({
        number: job.number, status: SERVICE_JOB_STATUS_LABEL[job.status as ServiceJobStatus], kind: SERVICE_KIND_LABEL[job.kind as ServiceJobKind], unit: job.productName, serial: job.serialNumber,
        customer: job.customer?.fullName ?? null, technician: tech?.fullName ?? null, fault: job.fault, diagnosis: job.diagnosis, resolution: job.resolution,
        partsUsed: job.parts.map((p) => `${p.part.name} × ${Number(p.quantity)}`),
        ...(job.kind === 'PAID' ? { quoted, paid: money(job.paidAmount), balance: quoted === null ? null : paidJobBalance(quoted, money(job.paidAmount)) } : {}),
        received: day(job.createdAt), assigned: day(job.assignedAt), repaired: day(job.repairedAt), qualityChecked: day(job.qaAt), returned: day(job.returnedAt),
        href: `/service/jobs/${job.id}`,
      }, [{ label: job.number, href: `/service/jobs/${job.id}` }]);
    },
  },
  {
    name: 'project_status',
    kind: 'read',
    status: 'Looking up the project…',
    description:
      'How a project is going: by its number (PRJ-…) or a word from its name — status, customer, contract value, delivery progress (units delivered of units contracted), milestones with their state (overdue, due soon, done), and the linked quotations, orders and build orders.',
    parameters: {
      type: 'object',
      properties: { project: { type: 'string', minLength: 2, maxLength: 80, description: 'The project number (PRJ-2026-000003) or part of its name.' } },
      required: ['project'],
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('projects.view'))) return refused('projects are for Project Managers, sales leadership and management.');
      const q = text(args.project, 80);
      if (!q) return nothing('Say which project.');
      const hit = await prisma.project.findFirst({ where: { ...(await orgWhere()), OR: [{ number: { equals: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] }, orderBy: { createdAt: 'desc' }, select: { id: true } });
      if (!hit) return nothing(`No project matching "${q}" in your organisation.`);
      const p = await getProject(hit.id);
      if (!p) return nothing(`No project matching "${q}" in your organisation.`);
      return ok({
        number: p.number, name: p.name, status: PROJECT_STATUS_LABEL[p.status as ProjectStatus], customer: p.customer.customerCompany?.companyName ?? p.customer.fullName, manager: p.manager.fullName,
        contractValue: p.contractValue, currency: p.currency, start: day(p.startDate), end: day(p.endDate),
        delivery: p.progress,
        milestones: p.milestones.map((m) => ({ name: m.name, due: day(m.dueDate), state: MILESTONE_STATE_LABEL[milestoneState(m)], done: day(m.completedAt) })),
        deliverables: p.deliverables.map((d) => ({ product: d.product.name, configuration: d.configuration?.name ?? null, site: d.siteName, contracted: d.quantity, delivered: d.deliveredQuantity, accepted: day(d.acceptedAt) })),
        linked: { quotations: p.quotations.map((x) => x.number), salesOrders: p.salesOrders.map((x) => x.number), buildOrders: p.buildOrders.map((x) => x.number) },
        href: `/projects/${p.id}`,
      }, [{ label: p.number, href: `/projects/${p.id}` }]);
    },
  },
];
