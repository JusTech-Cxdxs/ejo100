'use server';

import { prisma } from '@ejo/database';
import { allows, orgWhere, reachWhere } from '@/lib/authz/server';
import { requireUser } from './workshop';
import { lagosYmd } from '@/lib/nigeria-calendar';

/**
 * The personal side of the dashboard: the jobs this person is working on,
 * a few steps that only they can take, and their own numbers for the month.
 * Every query is either about the viewer's own records (indexed on the
 * person's id) or a count fenced to their reach — never a scan of the
 * whole business.
 */

export type MyWorkItem = { id: string; title: string; detail: string; url: string; createdAt: Date };
export type MyJob = { kind: 'JC' | 'SV'; id: string; number: string; status: string; as: 'Technician' | 'Supervisor'; vehicle: string; url: string; updatedAt: Date };
export type MyNumber = { label: string; value: number; hint: string; href?: string; icon: string; suffix?: string; decimals?: number; tone?: 'brand' | 'warning' | 'success' | 'neutral' };

const JC_OPEN = ['CHECKED_IN', 'IN_PROGRESS', 'AWAITING_PARTS', 'QUALITY_CHECK', 'AWAITING_CUSTOMER_APPROVAL'] as const;
const SV_OPEN = ['SCHEDULED', 'CHECKED_IN', 'IN_SERVICE'] as const;

function monthStart(): Date {
  return new Date(`${lagosYmd(new Date()).slice(0, 7)}-01T00:00:00+01:00`);
}

/** Steps waiting on this person that the other lists do not cover: assigning
 * a technician to a job they supervise, an approved road test they drive,
 * and their own approved exit pass to show at the gate. */
export async function getMyWorkItems(): Promise<MyWorkItem[]> {
  const user = await requireUser();
  const [work, mine] = await Promise.all([reachWhere('workshop.job_card.view'), reachWhere('security.exit_pass.request')]);
  const [jcs, svs, tests, passes, reminders] = await Promise.all([
    prisma.jobCard.findMany({ where: { ...work, supervisorId: user.id, approvalStatus: 'APPROVED', assignedTechnicianId: null, status: { in: [...JC_OPEN] } }, take: 20, select: { id: true, jobNumber: true, updatedAt: true } }),
    prisma.vehicleService.findMany({ where: { ...work, supervisorId: user.id, approvalStatus: 'APPROVED', assignedTechnicianId: null, escalatedToJobCardId: null, status: { in: [...SV_OPEN] } }, take: 20, select: { id: true, serviceNumber: true, createdAt: true } }),
    prisma.roadTestPermit.findMany({ where: { ...mine, status: 'APPROVED', driverId: user.id }, take: 10, select: { id: true, permitNumber: true, managerApprovedAt: true, createdAt: true, vehicle: { select: { plateNumber: true } } } }),
    prisma.exitPass.findMany({ where: { ...mine, status: 'APPROVED', OR: [{ requestedById: user.id }, { people: { some: { userId: user.id } } }] }, take: 10, select: { id: true, passNumber: true, managerApprovedAt: true, createdAt: true } }),
    // My own reminders that are due: delivered by the 10-minute job, or past due and not yet delivered.
    prisma.reminder.findMany({ where: { ownerId: user.id, OR: [{ status: 'SENT' }, { status: 'PENDING', dueAt: { lte: new Date() } }] }, orderBy: { dueAt: 'asc' }, take: 20, select: { id: true, title: true, recordRef: true, dueAt: true } }),
  ]);
  return [
    ...jcs.map((j: (typeof jcs)[number]) => ({ id: `my-assign-${j.id}`, title: `Assign a technician — ${j.jobNumber}`, detail: 'You are supervising this job and nobody is working on it yet.', url: `/workshop/job-cards/${j.id}`, createdAt: j.updatedAt })),
    ...svs.map((v: (typeof svs)[number]) => ({ id: `my-sassign-${v.id}`, title: `Assign a technician — ${v.serviceNumber}`, detail: 'You are supervising this service and nobody is working on it yet.', url: `/workshop/vehicle-service/${v.id}`, createdAt: v.createdAt })),
    ...tests.map((t: (typeof tests)[number]) => ({ id: `my-roadtest-${t.id}`, title: `Road test approved — ${t.permitNumber}`, detail: `You are the driver${t.vehicle?.plateNumber ? ` of ${t.vehicle.plateNumber}` : ''}. Security records the time and odometer at the gate.`, url: `/security/road-tests/${t.id}`, createdAt: t.managerApprovedAt ?? t.createdAt })),
    ...passes.map((p: (typeof passes)[number]) => ({ id: `my-exitpass-${p.id}`, title: `Exit pass approved — ${p.passNumber}`, detail: 'Show it at the gate when you go out.', url: `/security/exit-passes/${p.id}`, createdAt: p.managerApprovedAt ?? p.createdAt })),
    ...reminders.map((r: (typeof reminders)[number]) => ({ id: `my-reminder-${r.id}`, title: `Reminder — ${r.title}`, detail: `${r.recordRef ? `About ${r.recordRef}. ` : ''}Mark it done or snooze it.`, url: `/reminders?focus=${r.id}#r-${r.id}`, createdAt: r.dueAt })),
  ];
}

/** Open jobs where this person is the technician or the supervisor. */
export async function getMyJobs(): Promise<MyJob[]> {
  const user = await requireUser();
  const work = await reachWhere('workshop.job_card.view');
  const veh = { select: { plateNumber: true, make: true, model: true } } as const;
  const [jcs, svs] = await Promise.all([
    prisma.jobCard.findMany({ where: { ...work, status: { in: [...JC_OPEN, 'COMPLETED', 'READY_FOR_COLLECTION'] }, OR: [{ assignedTechnicianId: user.id }, { supervisorId: user.id }] }, orderBy: { updatedAt: 'desc' }, take: 12, select: { id: true, jobNumber: true, status: true, supervisorId: true, updatedAt: true, vehicle: veh } }),
    prisma.vehicleService.findMany({ where: { ...work, escalatedToJobCardId: null, status: { in: [...SV_OPEN, 'COMPLETED', 'READY_FOR_COLLECTION'] }, OR: [{ assignedTechnicianId: user.id }, { supervisorId: user.id }] }, orderBy: { createdAt: 'desc' }, take: 12, select: { id: true, serviceNumber: true, status: true, supervisorId: true, createdAt: true, vehicle: veh } }),
  ]);
  type V = { plateNumber: string | null; make: string | null; model: string | null } | null;
  const car = (v: V) => [v?.plateNumber, [v?.make, v?.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  return [
    ...jcs.map((j: (typeof jcs)[number]) => ({ kind: 'JC' as const, id: j.id, number: j.jobNumber, status: j.status, as: j.supervisorId === user.id ? 'Supervisor' as const : 'Technician' as const, vehicle: car(j.vehicle), url: `/workshop/job-cards/${j.id}`, updatedAt: j.updatedAt })),
    ...svs.map((v: (typeof svs)[number]) => ({ kind: 'SV' as const, id: v.id, number: v.serviceNumber, status: v.status, as: v.supervisorId === user.id ? 'Supervisor' as const : 'Technician' as const, vehicle: car(v.vehicle), url: `/workshop/vehicle-service/${v.id}`, updatedAt: v.createdAt })),
  ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 12);
}

/** This month's numbers for the work this person does — only the tiles for
 * permissions they hold, each a cheap count. */
export async function getMyNumbers(): Promise<MyNumber[]> {
  const user = await requireUser();
  const since = monthStart();
  const [canWork, canSupervise, canSource, frontDesk, closes, release, payments, eprReview, warranty, gate] = await Promise.all([
    allows('workshop.job.work'), allows('workshop.job.supervise'), allows('sourcing.request'), allows('workshop.job_card.create'), allows('workshop.close.approve'),
    allows('store.prs.release'), allows('workshop.payment.record'), allows('procurement.epr.review'), allows('warranty.manage'), allows('security.gate.operate'),
  ]);
  const [work, store, desk, mine] = await Promise.all([reachWhere('workshop.job_card.view'), reachWhere('store.view'), reachWhere('security.view'), reachWhere('security.exit_pass.request')]);
  const n = (p: Promise<number>) => p.catch(() => 0);
  const out: MyNumber[] = [];

  if (canWork) {
    const [jcDone, svDone] = await Promise.all([
      prisma.jobCard.findMany({ where: { ...work, assignedTechnicianId: user.id, completedAt: { gte: since } }, take: 500, select: { workStartedAt: true, completedAt: true } }),
      prisma.vehicleService.findMany({ where: { ...work, assignedTechnicianId: user.id, completedAt: { gte: since } }, take: 500, select: { workStartedAt: true, completedAt: true } }),
    ]);
    const done = [...jcDone, ...svDone];
    const timed = done.filter((d: { workStartedAt: Date | null; completedAt: Date | null }) => d.workStartedAt && d.completedAt && d.completedAt > d.workStartedAt);
    const hours = timed.length ? timed.reduce((s: number, d: { workStartedAt: Date | null; completedAt: Date | null }) => s + (d.completedAt!.getTime() - d.workStartedAt!.getTime()), 0) / timed.length / 3600000 : 0;
    const open = await n(Promise.all([
      prisma.jobCard.count({ where: { ...work, assignedTechnicianId: user.id, status: { in: [...JC_OPEN] } } }),
      prisma.vehicleService.count({ where: { ...work, assignedTechnicianId: user.id, escalatedToJobCardId: null, status: { in: [...SV_OPEN] } } }),
    ]).then(([a, b]) => a + b));
    out.push({ label: 'My jobs in progress', value: open, hint: 'Assigned to you, not yet completed', icon: 'wrench' });
    out.push({ label: 'Completed this month', value: done.length, hint: 'Jobs and services you finished', icon: 'check-circle', tone: 'success' });
    out.push({ label: 'Average time per job', value: Math.round(hours * 10) / 10, decimals: 1, suffix: ' h', hint: timed.length ? `From start to completed, ${timed.length === 1 ? '1 job' : `${timed.length} jobs`} this month` : 'No timed jobs yet this month', icon: 'clock' });
  }
  if (canSupervise) {
    const sup = await n(Promise.all([
      prisma.jobCard.count({ where: { ...work, supervisorId: user.id, status: { in: [...JC_OPEN, 'COMPLETED'] } } }),
      prisma.vehicleService.count({ where: { ...work, supervisorId: user.id, escalatedToJobCardId: null, status: { in: [...SV_OPEN, 'COMPLETED'] } } }),
    ]).then(([a, b]) => a + b));
    out.push({ label: 'Jobs I supervise', value: sup, hint: 'Open jobs and services you are responsible for', icon: 'users' });
  }
  if (canSource) {
    const prs = await n(prisma.partRequestSlip.count({ where: { ...work, requestedById: user.id, status: { in: ['PENDING_HOD_APPROVAL', 'PENDING_STORE_APPROVAL', 'APPROVED'] } } }));
    out.push({ label: 'My parts requests open', value: prs, hint: 'Waiting for approval or release', href: '/workshop/parts-requests', icon: 'package', tone: prs ? 'warning' : 'neutral' });
  }
  if (frontDesk) {
    const [ready, opened] = await Promise.all([
      n(Promise.all([prisma.jobCard.count({ where: { ...work, status: 'READY_FOR_COLLECTION' } }), prisma.vehicleService.count({ where: { ...work, status: 'READY_FOR_COLLECTION' } })]).then(([a, b]) => a + b)),
      n(Promise.all([prisma.jobCard.count({ where: { ...work, createdById: user.id, createdAt: { gte: since } } }), prisma.vehicleService.count({ where: { ...work, createdById: user.id, createdAt: { gte: since } } })]).then(([a, b]) => a + b)),
    ]);
    out.push({ label: 'Ready for collection', value: ready, hint: 'Vehicles waiting for their customers', href: '/workshop/custody', icon: 'car', tone: ready ? 'warning' : 'neutral' });
    out.push({ label: 'Opened by me this month', value: opened, hint: 'Job Cards and Vehicle Services', icon: 'clipboard' });
  }
  if (closes) {
    const [inWork, closed] = await Promise.all([
      n(prisma.jobCard.count({ where: { ...work, status: { in: [...JC_OPEN] } } })),
      n(Promise.all([prisma.jobCard.count({ where: { ...work, closedAt: { gte: since } } }), prisma.vehicleService.count({ where: { ...work, closedAt: { gte: since } } })]).then(([a, b]) => a + b)),
    ]);
    out.push({ label: 'Jobs in the workshop', value: inWork, hint: 'Job Cards being worked on in your branch', href: '/workshop/custody', icon: 'garage' });
    out.push({ label: 'Closed this month', value: closed, hint: 'Job Cards and Vehicle Services', icon: 'check-circle', tone: 'success' });
  }
  if (release) {
    const [toRelease, low] = await Promise.all([
      n(prisma.partRequestSlip.count({ where: { ...store, status: { in: ['PENDING_STORE_APPROVAL', 'APPROVED'] } } })),
      n(prisma.part.findMany({ where: { ...store, isActive: true, reorderPoint: { not: null } }, take: 2000, select: { reorderPoint: true, stock: { select: { quantityOnHand: true } } } })
        .then((ps: { reorderPoint: unknown; stock: { quantityOnHand: unknown } | null }[]) => ps.filter((p) => Number(p.stock?.quantityOnHand ?? 0) <= Number(p.reorderPoint)).length)),
    ]);
    out.push({ label: 'Parts requests for the Store', value: toRelease, hint: 'To approve and reserve, or to hand over', href: '/workshop/parts-requests', icon: 'package', tone: toRelease ? 'warning' : 'neutral' });
    out.push({ label: 'Parts at or below reorder point', value: low, hint: 'Time to reorder', href: '/inventory/parts', icon: 'boxes', tone: low ? 'warning' : 'neutral' });
  }
  if (payments) {
    const recorded = await n(prisma.payment.count({ where: { recordedById: user.id, recordedAt: { gte: since }, OR: [{ jobCard: work }, { vehicleService: work }] } }));
    out.push({ label: 'Payments I recorded this month', value: recorded, hint: 'Job Cards and Vehicle Services', icon: 'money' });
  }
  if (eprReview) {
    const epr = await n(prisma.externalProcurementRequest.count({ where: { ...store, status: { in: ['PENDING_FINANCE_REVIEW', 'APPROVED'] } } }));
    out.push({ label: 'Outside purchases with Finance', value: epr, hint: 'To review, or approved and waiting for cash', href: '/workshop/external-procurement', icon: 'cart', tone: epr ? 'warning' : 'neutral' });
  }
  if (warranty) {
    // Warranties belong to the organisation's customers (the same fence as the Warranty pages).
    const customer = await orgWhere();
    const [toVerify, claims] = await Promise.all([
      n(prisma.warranty.count({ where: { customer, status: 'PENDING_VERIFICATION' } })),
      n(prisma.warrantyClaim.count({ where: { customer, status: { in: ['DRAFT', 'PENDING_HOD', 'PENDING_MANAGER', 'APPROVED_TO_SUBMIT', 'SUBMITTED'] } } })),
    ]);
    out.push({ label: 'Warranties awaiting verification', value: toVerify, hint: 'Registered, not yet verified', href: '/warranty', icon: 'shield-check', tone: toVerify ? 'warning' : 'neutral' });
    out.push({ label: 'Warranty claims open', value: claims, hint: 'Not yet settled or closed', href: '/warranty/claims', icon: 'file' });
  }
  if (gate) {
    const [onSite, out2, tests] = await Promise.all([
      n(prisma.visit.count({ where: { ...desk, status: 'CHECKED_IN' } })),
      n(prisma.exitPass.count({ where: { ...desk, status: 'OUT' } })),
      n(prisma.roadTestPermit.count({ where: { ...desk, status: 'OUT' } })),
    ]);
    out.push({ label: 'Visitors on site', value: onSite, hint: 'Checked in, not yet out', href: '/security/on-premises', icon: 'badge' });
    out.push({ label: 'Staff out on passes', value: out2, hint: 'Due back through the gate', href: '/security/people-out', icon: 'walk' });
    out.push({ label: 'Vehicles on road test', value: tests, hint: 'Out with a driver', href: '/security/road-tests?tab=out', icon: 'road' });
  }
  if (out.length === 0) {
    // Everyone requests their own exit passes — the one number that is always theirs.
    const passes = await n(prisma.exitPass.count({ where: { ...mine, requestedById: user.id, createdAt: { gte: since } } }));
    out.push({ label: 'My exit passes this month', value: passes, hint: 'Requested by you', href: '/security/exit-passes', icon: 'exit' });
  }
  return out;
}
