'use server';

import { prisma, type Prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { navigationFor } from '@/lib/authz/navigation';
import { firstReach, getPrincipal, jobOrServiceReach, myOrganisationId, orgOwned, orgWhere, partsOfMyOrganisation, reachWhere } from '@/lib/authz/server';
import { ticketReachWhere } from '@/lib/support-rules';
import { decide, STORE_COST_PERMISSIONS, type PermissionKey } from '@/lib/authz/catalogue';
import { getSchedulingAccess } from './scheduling';
import { groupRank, numberFilters, planSearch, referenceUrl, type RefPrefix, type SearchPlan } from '@/lib/search-plan';
import { fenceStaffHelp } from '@/lib/support/reach';

export type SearchHit = { label: string; sub?: string; href: string };
/** prefix: the reference prefix of this kind of record (shown next to the group name). */
export type SearchGroup = { group: string; prefix?: string; hits: SearchHit[] };

/** List pages, found by name. The reference prefix is part of the name, so "VX" also finds the Vehicle exits page. */
const MORE_PAGES: (SearchHit & { needs?: PermissionKey[] })[] = [
  { label: 'Job Cards (JC)', href: '/workshop/job-cards', needs: ['workshop.view'] },
  { label: 'Vehicle Services (SV)', href: '/workshop/vehicle-service', needs: ['workshop.view'] },
  { label: 'Vehicles', href: '/workshop/vehicles', needs: ['workshop.view'] },
  { label: 'Customers', href: '/workshop/customers', needs: ['workshop.view'] },
  { label: 'In custody', href: '/workshop/custody', needs: ['workshop.view'] },
  { label: 'Parts', href: '/inventory/parts', needs: ['store.view'] },
  { label: 'Goods receipts (GRN)', href: '/inventory/goods-receipts', needs: STORE_COST_PERMISSIONS },
  { label: 'Inventory analytics', href: '/inventory/analytics', needs: ['analytics.inventory.view'] },
  { label: 'Parts requests (PRS)', href: '/workshop/parts-requests', needs: ['workshop.view'] },
  { label: 'External procurement (EPR)', href: '/workshop/external-procurement', needs: ['workshop.view'] },
  { label: 'Warranties (WR)', href: '/warranty', needs: ['warranty.view'] },
  { label: 'Warranty claims (WC)', href: '/warranty/claims', needs: ['warranty.view'] },
  { label: 'Visitors (VIS)', href: '/security/visitors', needs: ['security.view'] },
  { label: 'Exit passes (EP)', href: '/security/exit-passes' },
  { label: 'Vehicle exits (VX)', href: '/security/vehicles', needs: ['security.view'] },
  { label: 'Road tests (RT)', href: '/security/road-tests', needs: ['security.view', 'workshop.job_card.view'] },
  { label: 'Incidents (INC)', href: '/security/incidents', needs: ['security.view'] },
  { label: 'Deliveries (DLV)', href: '/security/deliveries', needs: ['security.view', 'store.grn.record'] },
  { label: 'Contractors (CTR)', href: '/security/contractors', needs: ['security.view', 'security.pass.approve'] },
  { label: 'Calendar', href: '/schedule/calendar', needs: ['schedule.view'] },
  { label: 'Appointments (APT)', href: '/schedule/appointments', needs: ['schedule.view'] },
  { label: 'Notification Center', href: '/notifications' },
  { label: 'Broadcasts (BC)', href: '/notifications/broadcasts', needs: ['notifications.broadcast.send'] },
  { label: 'Support centre (SUP)', href: '/crm/support', needs: ['support.tickets.manage'] },
];

type Text = { startsWith?: string; contains?: string; mode?: 'insensitive' };
type Where = Record<string, unknown>;
/** "customer.fullName" + filter → { customer: { fullName: filter } }; "people.some.name" works the same way. */
const at = (path: string, f: Text): Where => path.split('.').reduceRight<unknown>((inner, key) => ({ [key]: inner }), f) as Where;

/** What one table can be searched by. */
type Fields = {
  /** Reference-number columns, by prefix. */
  numbers?: [RefPrefix, string][];
  /** Names and descriptions. */
  text?: string[];
  /** Plates, part numbers, chassis, staff numbers: also matched without dashes or spaces. */
  codes?: string[];
  /** Phone numbers: matched only when a number is typed. */
  phones?: string[];
};

/** The OR list for one table under this plan; empty = the table cannot match, so it is not asked. */
function conditions(plan: SearchPlan, f: Fields): Where[] {
  const out: Where[] = [];
  for (const [prefix, column] of f.numbers ?? []) for (const nf of numberFilters(plan, prefix)) out.push({ [column]: nf });
  const m = (field: string, value = plan.q) => at(field, plan.short ? { startsWith: value, mode: 'insensitive' } : { contains: value, mode: 'insensitive' });
  if (plan.textScope === 'all') for (const field of f.text ?? []) out.push(m(field));
  if (plan.textScope !== 'none') {
    for (const field of f.codes ?? []) for (const form of plan.codeForms) out.push(m(field, form));
    for (const field of f.phones ?? []) for (const p of plan.phones) out.push(at(field, { contains: p }));
  }
  return out;
}

/**
 * The header's master search: every module at once, grouped, each hit a
 * direct link to the record. The query is planned first (lib/search-plan.ts)
 * so only the tables that could hold an answer are asked: "VX" asks the
 * vehicle exits (and names), "000012" asks every reference number, "Ada"
 * asks names. Each is a small query of at most 5 rows, all in parallel.
 *
 * A record type is searched only for people who may open its page, with the
 * same branch and organisation reach as that page; each page still checks
 * again when opened. Search never shows more than the pages would.
 */
export async function globalSearch(raw: string): Promise<SearchGroup[]> {
  const user = await requireUser();
  const plan = planSearch(typeof raw === 'string' ? raw : '');
  if (plan.kind === 'empty') return [];
  const { take } = plan;
  const principal = await getPrincipal();
  const allowed = (key: PermissionKey) => decide(principal, key).allowed;
  const any = (keys: PermissionKey[]) => keys.some(allowed);
  const lower = plan.q.toLowerCase();
  const pages: SearchHit[] = [
    ...navigationFor(principal).filter((x) => x.status === 'LIVE' && x.name.toLowerCase().includes(lower)).map((x) => ({ label: x.name, sub: 'Module', href: x.href })),
    ...MORE_PAGES.filter((x) => x.label.toLowerCase().includes(lower) && (!x.needs || any(x.needs))).map(({ label, href }) => ({ label, sub: 'Page', href })),
  ].filter((x, i, all) => all.findIndex((y) => y.href === x.href) === i).slice(0, 6);

  // Reach, per module: the same filters the lists and record pages use. null = may not open this type.
  const reachAny = async (keys: PermissionKey[]): Promise<Where | null> => {
    const open = keys.filter(allowed);
    if (!open.length) return null;
    const reaches = await Promise.all(open.map((k) => reachWhere(k, { lens: false })));
    return reaches.some((r) => r.branchId === undefined) ? {} : { OR: reaches };
  };
  const canWorkshop = allowed('workshop.view');
  const [jobReach, storeReach, securityReach, roadTestReach, deliveryReach, contractorReach, prsReach, eprReach, grnReach, refundReach] = await Promise.all([
    canWorkshop ? reachAny(['workshop.job_card.view']) : null,
    reachAny(['store.view']),
    reachAny(['security.view']),
    reachAny(['security.view', 'workshop.job_card.view']),
    reachAny(['security.view', 'store.grn.record']),
    reachAny(['security.view', 'security.pass.approve']),
    canWorkshop ? reachAny(['workshop.job_card.view', 'store.view']) : null,
    canWorkshop ? reachAny(['workshop.job_card.view', 'store.view', 'procurement.epr.review']) : null,
    any(STORE_COST_PERMISSIONS) ? firstReach(STORE_COST_PERMISSIONS) : null,
    canWorkshop && allowed('workshop.job_card.view') ? jobOrServiceReach() : null,
  ]);
  // The people a security record is about (requester, host, people on a pass) see it, inside their organisation.
  const ownOrg: Where = principal.orgBranchIds ? { branchId: { in: principal.orgBranchIds } } : {};
  const mine = (...people: Where[]): Where => ({ AND: [ownOrg, { OR: people }] });
  const either = (reach: Where | null, own: Where): Where => (reach ? { OR: [reach, own] } : own);
  const passReach = either(securityReach, mine({ requestedById: user.id }, { people: { some: { userId: user.id } } }));
  const visitReach = either(securityReach, mine({ hostUserId: user.id }));
  const ctrReach = either(contractorReach, mine({ hostUserId: user.id }, { requestedById: user.id }));
  // Appointments: this organisation's, on calendars this person may use or meetings they are in.
  const sched = await getSchedulingAccess().catch(() => null);
  const apptReach: Where | null = sched
    ? { AND: [await partsOfMyOrganisation(), sched.isAdmin ? {} : { OR: [{ ownerId: { in: sched.owners.map((o) => o.id) } }, { createdById: user.id }, { participants: { some: { userId: user.id } } }] }] }
    : null;
  const [mineOrg, owned] = await Promise.all([orgWhere(), orgOwned()]);
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { organisationId: true } });
  // Staff: same organisation; the platform team is never listed to organisations.
  const staffReach = { ...(me?.organisationId ? { organisationId: me.organisationId } : {}), ...(principal.isSuperAdmin ? {} : { roles: { none: { role: { isSuperAdmin: true } } } }) };
  const sameOrg = { organisationId: me?.organisationId ?? '__none__' };
  const canCustomers = canWorkshop || allowed('crm.view');
  const canWarranty = allowed('warranty.view');
  const canStructure = allowed('admin.structure.manage');
  // Support tickets: the inbox's own fence (organisation + branch reach; website enquiries are the organisation's).
  const supportReach: Where | null = allowed('support.tickets.manage') ? (await fenceStaffHelp(ticketReachWhere(await reachWhere('support.tickets.manage', { lens: false }), await myOrganisationId()))) : null;

  // At most 4 lookups at once: one search never takes every database connection from the pages around it.
  let running = 0;
  const waiting: (() => void)[] = [];
  const slot = async <T,>(fn: () => Promise<T>): Promise<T> => {
    if (running >= 4) await new Promise<void>((r) => waiting.push(r));
    running += 1;
    try { return await fn(); } finally { running -= 1; waiting.shift()?.(); }
  };

  /** Runs one table's search when the person may open it and the query can match it. */
  function find<T>(reach: Where | null | false, fields: Fields, run: (where: Where) => Promise<T[]>): Promise<T[]> {
    if (!reach) return Promise.resolve([]);
    const or = conditions(plan, fields);
    if (!or.length) return Promise.resolve([]);
    return slot(() => run({ AND: [reach, { OR: or }] })).catch(() => [] as T[]);
  }
  const W = <T,>(w: Where) => w as T;
  const newest = { createdAt: 'desc' } as const;

  const [jcs, svs, prs, eprs, grns, refunds, warranties, claims, visits, passes, exits, tests, incidents, deliveries, contractors, appts, broadcasts, tickets, vehicles, customers, parts, policies, providers, rooms, branches, departments, staff] = await Promise.all([
    find(jobReach, { numbers: [['JC', 'jobNumber']], text: ['customer.fullName'], codes: ['vehicle.plateNumber'], phones: ['customer.phone'] },
      (w) => prisma.jobCard.findMany({ where: W<Prisma.JobCardWhereInput>(w), take, orderBy: newest, select: { id: true, branchId: true, jobNumber: true, status: true, customer: { select: { fullName: true } }, vehicle: { select: { plateNumber: true } } } })),
    find(jobReach, { numbers: [['SV', 'serviceNumber']], text: ['customer.fullName'], codes: ['vehicle.plateNumber'], phones: ['customer.phone'] },
      (w) => prisma.vehicleService.findMany({ where: W<Prisma.VehicleServiceWhereInput>(w), take, orderBy: newest, select: { id: true, branchId: true, serviceNumber: true, status: true, customer: { select: { fullName: true } }, vehicle: { select: { plateNumber: true } } } })),
    find(prsReach, { numbers: [['PRS', 'referenceNumber']] },
      (w) => prisma.partRequestSlip.findMany({ where: W<Prisma.PartRequestSlipWhereInput>(w), take, orderBy: newest, select: { id: true, branchId: true, referenceNumber: true, status: true, jobCard: { select: { jobNumber: true } }, vehicleService: { select: { serviceNumber: true } } } })),
    find(eprReach, { numbers: [['EPR', 'referenceNumber']], text: ['description'] },
      (w) => prisma.externalProcurementRequest.findMany({ where: W<Prisma.ExternalProcurementRequestWhereInput>(w), take, orderBy: newest, select: { id: true, branchId: true, referenceNumber: true, status: true, description: true } })),
    find(grnReach, { numbers: [['GRN', 'referenceNumber']], text: ['supplierName'] },
      (w) => prisma.goodsReceipt.findMany({ where: W<Prisma.GoodsReceiptWhereInput>(w), take, orderBy: { receivedAt: 'desc' }, select: { id: true, referenceNumber: true, supplierName: true } })),
    find(refundReach, { numbers: [['RF', 'referenceNumber']], text: ['paidToName'] },
      (w) => prisma.refund.findMany({ where: W<Prisma.RefundWhereInput>(w), take, orderBy: { recordedAt: 'desc' }, select: { referenceNumber: true, paidToName: true, jobCard: { select: { id: true, jobNumber: true, branchId: true } }, vehicleService: { select: { id: true, serviceNumber: true, branchId: true } } } })),
    find(canWarranty && { customer: mineOrg }, { numbers: [['WR', 'warrantyNumber']], text: ['subjectDescription', 'customer.fullName'], codes: ['vehicle.plateNumber'] },
      (w) => prisma.warranty.findMany({ where: W<Prisma.WarrantyWhereInput>(w), take, orderBy: newest, select: { id: true, warrantyNumber: true, subjectDescription: true } })),
    find(canWarranty && { customer: mineOrg }, { numbers: [['WC', 'claimNumber']], text: ['customer.fullName', 'causalPart'], codes: ['causalPartNumber', 'providerReference'] },
      (w) => prisma.warrantyClaim.findMany({ where: W<Prisma.WarrantyClaimWhereInput>(w), take, orderBy: newest, select: { id: true, claimNumber: true, status: true, customer: { select: { fullName: true } } } })),
    find(visitReach, { numbers: [['VIS', 'visitNumber'], ['VP', 'passNumber']], text: ['visitorName', 'company'], codes: ['vehiclePlate'], phones: ['phone'] },
      (w) => prisma.visit.findMany({ where: W<Prisma.VisitWhereInput>(w), take, orderBy: newest, select: { id: true, branchId: true, hostUserId: true, visitNumber: true, passNumber: true, visitorName: true, company: true } })),
    find(passReach, { numbers: [['EP', 'passNumber']], text: ['reason', 'people.some.name'] },
      (w) => prisma.exitPass.findMany({ where: W<Prisma.ExitPassWhereInput>(w), take, orderBy: newest, select: { id: true, branchId: true, requestedById: true, people: { select: { userId: true } }, passNumber: true, status: true, requestedBy: { select: { fullName: true } } } })),
    find(securityReach, { numbers: [['VX', 'exitNumber']], text: ['driverName'], codes: ['vehicle.plateNumber'] },
      (w) => prisma.vehicleGateExit.findMany({ where: W<Prisma.VehicleGateExitWhereInput>(w), take, orderBy: newest, select: { id: true, branchId: true, exitNumber: true, vehicle: { select: { make: true, model: true, plateNumber: true } } } })),
    find(roadTestReach, { numbers: [['RT', 'permitNumber']], text: ['purpose'], codes: ['vehicle.plateNumber'] },
      (w) => prisma.roadTestPermit.findMany({ where: W<Prisma.RoadTestPermitWhereInput>(w), take, orderBy: newest, select: { id: true, branchId: true, permitNumber: true, status: true, vehicle: { select: { plateNumber: true } } } })),
    find(securityReach, { numbers: [['INC', 'incidentNumber']], text: ['type', 'location'], codes: ['vehiclePlate'] },
      (w) => prisma.securityIncident.findMany({ where: W<Prisma.SecurityIncidentWhereInput>(w), take, orderBy: newest, select: { id: true, branchId: true, incidentNumber: true, type: true } })),
    find(deliveryReach, { numbers: [['DLV', 'deliveryNumber']], text: ['supplierName', 'driverName'], codes: ['reference', 'vehiclePlate'], phones: ['driverPhone'] },
      (w) => prisma.gateDelivery.findMany({ where: W<Prisma.GateDeliveryWhereInput>(w), take, orderBy: newest, select: { id: true, branchId: true, deliveryNumber: true, supplierName: true } })),
    find(ctrReach, { numbers: [['CTR', 'passNumber']], text: ['company', 'leadName'], phones: ['phone'] },
      (w) => prisma.contractorPass.findMany({ where: W<Prisma.ContractorPassWhereInput>(w), take, orderBy: newest, select: { id: true, branchId: true, hostUserId: true, requestedById: true, passNumber: true, company: true } })),
    find(apptReach, { numbers: [['APT', 'appointmentNumber']], text: ['title'] },
      (w) => prisma.appointment.findMany({ where: W<Prisma.AppointmentWhereInput>(w), take, orderBy: { startsAt: 'desc' }, select: { id: true, appointmentNumber: true, title: true } })),
    find(allowed('notifications.broadcast.send') && sameOrg, { numbers: [['BC', 'broadcastNumber']], text: ['title'] },
      (w) => prisma.broadcast.findMany({ where: W<Prisma.BroadcastWhereInput>(w), take, orderBy: newest, select: { id: true, broadcastNumber: true, title: true } })),
    find(supportReach, { numbers: [['SUP', 'number']], text: ['contactName', 'subject'], phones: ['contactPhone'] },
      (w) => prisma.supportTicket.findMany({ where: W<Prisma.SupportTicketWhereInput>(w), take, orderBy: newest, select: { id: true, number: true, contactName: true, status: true } })),
    find(canWorkshop && { customer: mineOrg }, { text: ['make', 'model'], codes: ['plateNumber', 'chassisNumber', 'engineNumber'] },
      (w) => prisma.customerVehicle.findMany({ where: W<Prisma.CustomerVehicleWhereInput>(w), take, select: { id: true, make: true, model: true, plateNumber: true, customer: { select: { fullName: true } } } })),
    find(canCustomers && mineOrg, { text: ['fullName', 'email'], phones: ['phone', 'altPhone'] },
      (w) => prisma.customer.findMany({ where: W<Prisma.CustomerWhereInput>(w), take, select: { id: true, fullName: true, phone: true } })),
    find(storeReach, { text: ['name'], codes: ['partNumber', 'barcode'] },
      (w) => prisma.part.findMany({ where: W<Prisma.PartWhereInput>(w), take, select: { id: true, branchId: true, partNumber: true, name: true } })),
    find(canWarranty && owned, { text: ['name'], codes: ['code'] },
      (w) => prisma.warrantyPolicy.findMany({ where: W<Prisma.WarrantyPolicyWhereInput>(w), take, select: { id: true, name: true, code: true } })),
    find(canWarranty && owned, { text: ['name'] },
      (w) => prisma.warrantyProvider.findMany({ where: W<Prisma.WarrantyProviderWhereInput>(w), take, select: { id: true, name: true } })),
    find(any(['schedule.view', 'schedule.manage']) && ownOrg, { text: ['name'] },
      (w) => prisma.meetingRoom.findMany({ where: W<Prisma.MeetingRoomWhereInput>(w), take, select: { id: true, name: true } })),
    find(canStructure && (mineOrg.organisationId ? { businessUnit: mineOrg } : {}), { text: ['name'] },
      (w) => prisma.branch.findMany({ where: W<Prisma.BranchWhereInput>(w), take, select: { id: true, name: true } })),
    find(canStructure && (mineOrg.organisationId ? { branch: { businessUnit: mineOrg } } : {}), { text: ['name'] },
      (w) => prisma.department.findMany({ where: W<Prisma.DepartmentWhereInput>(w), take, select: { id: true, name: true, branchId: true, branch: { select: { name: true } } } })),
    find(allowed('admin.users.manage') && staffReach, { text: ['fullName', 'email'], codes: ['employeeId'], phones: ['phone'] },
      (w) => prisma.user.findMany({ where: W<Prisma.UserWhereInput>(w), take, select: { id: true, fullName: true, email: true } })),
  ]);

  // A second check per record, with its branch: the same decision its page makes (a
  // department-scoped approver reaches their own branch only, though the query fence is wider).
  const opens = (keys: PermissionKey[], branchId: string | null | undefined) => keys.some((k) => decide(principal, k, { branchId: branchId ?? null }).allowed);
  const JOB: PermissionKey[] = ['workshop.job_card.view'];
  const SEC: PermissionKey[] = ['security.view'];
  const words = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const dot = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ') || undefined;
  const canCrm = allowed('crm.view');
  const ref = (prefix: RefPrefix, group: string, hits: SearchHit[]): SearchGroup => ({ group, prefix, hits });
  const groups: SearchGroup[] = [
    { group: 'Pages', hits: pages },
    ref('JC', 'Job Cards', jcs.filter((r) => opens(JOB, r.branchId)).map((r) => ({ label: r.jobNumber, sub: dot(r.customer.fullName, r.vehicle?.plateNumber, words(r.status)), href: referenceUrl('JC', r.id) }))),
    ref('SV', 'Vehicle Services', svs.filter((r) => opens(JOB, r.branchId)).map((r) => ({ label: r.serviceNumber, sub: dot(r.customer.fullName, r.vehicle?.plateNumber, words(r.status)), href: referenceUrl('SV', r.id) }))),
    ref('PRS', 'Parts requests', prs.filter((r) => opens(['workshop.job_card.view', 'store.view'], r.branchId)).map((r) => ({ label: r.referenceNumber, sub: dot(r.jobCard?.jobNumber ?? r.vehicleService?.serviceNumber, words(r.status)), href: referenceUrl('PRS', r.id) }))),
    ref('EPR', 'External procurement', eprs.filter((r) => opens(['workshop.job_card.view', 'store.view', 'procurement.epr.review'], r.branchId)).map((r) => ({ label: r.referenceNumber, sub: dot(r.description, words(r.status)), href: referenceUrl('EPR', r.id) }))),
    ref('GRN', 'Goods receipts', grns.map((r) => ({ label: r.referenceNumber, sub: r.supplierName, href: referenceUrl('GRN', r.id) }))),
    // A refund opens on its Job Card or Vehicle Service.
    ref('RF', 'Refunds', refunds.flatMap((r) => {
      if (!opens(JOB, r.jobCard?.branchId ?? r.vehicleService?.branchId)) return [];
      const parent = r.jobCard ? { n: r.jobCard.jobNumber, url: referenceUrl('JC', r.jobCard.id) } : r.vehicleService ? { n: r.vehicleService.serviceNumber, url: referenceUrl('SV', r.vehicleService.id) } : null;
      return parent ? [{ label: r.referenceNumber, sub: dot(`On ${parent.n}`, r.paidToName), href: parent.url }] : [];
    })),
    ref('WR', 'Warranties', warranties.map((r) => ({ label: r.warrantyNumber, sub: r.subjectDescription, href: referenceUrl('WR', r.id) }))),
    ref('WC', 'Warranty claims', claims.map((r) => ({ label: r.claimNumber, sub: dot(r.customer.fullName, words(r.status)), href: referenceUrl('WC', r.id) }))),
    ref('VIS', 'Visitors', visits.filter((r) => opens(SEC, r.branchId) || r.hostUserId === user.id).map((r) => ({ label: r.visitNumber, sub: dot(r.visitorName, r.company, r.passNumber ? `Pass ${r.passNumber}` : null), href: referenceUrl('VIS', r.id) }))),
    ref('EP', 'Exit passes', passes.filter((r) => opens(SEC, r.branchId) || r.requestedById === user.id || r.people.some((x) => x.userId === user.id)).map((r) => ({ label: r.passNumber, sub: dot(r.requestedBy?.fullName, words(r.status)), href: referenceUrl('EP', r.id) }))),
    ref('VX', 'Vehicle exits', exits.filter((r) => opens(SEC, r.branchId)).map((r) => ({ label: r.exitNumber, sub: dot([r.vehicle?.make, r.vehicle?.model].filter(Boolean).join(' '), r.vehicle?.plateNumber), href: referenceUrl('VX', r.id) }))),
    ref('RT', 'Road tests', tests.filter((r) => opens(['security.view', 'workshop.job_card.view'], r.branchId)).map((r) => ({ label: r.permitNumber, sub: dot(r.vehicle?.plateNumber, words(r.status)), href: referenceUrl('RT', r.id) }))),
    ref('INC', 'Incidents', incidents.filter((r) => opens(SEC, r.branchId)).map((r) => ({ label: r.incidentNumber, sub: r.type, href: referenceUrl('INC', r.id) }))),
    ref('DLV', 'Deliveries', deliveries.filter((r) => opens(['security.view', 'store.grn.record'], r.branchId)).map((r) => ({ label: r.deliveryNumber, sub: r.supplierName, href: referenceUrl('DLV', r.id) }))),
    ref('CTR', 'Contractors', contractors.filter((r) => opens(['security.view', 'security.pass.approve'], r.branchId) || r.hostUserId === user.id || r.requestedById === user.id).map((r) => ({ label: r.passNumber, sub: r.company, href: referenceUrl('CTR', r.id) }))),
    ref('APT', 'Appointments', appts.map((r) => ({ label: r.appointmentNumber, sub: r.title, href: referenceUrl('APT', r.id) }))),
    ref('BC', 'Broadcasts', broadcasts.map((r) => ({ label: r.broadcastNumber, sub: r.title, href: referenceUrl('BC', r.id) }))),
    ref('SUP', 'Support tickets', tickets.map((r) => ({ label: r.number, sub: dot(r.contactName, words(r.status)), href: referenceUrl('SUP', r.id) }))),
    { group: 'Vehicles', hits: vehicles.map((r) => ({ label: [r.make, r.model].filter(Boolean).join(' ') || 'Vehicle', sub: dot(r.plateNumber, r.customer?.fullName), href: `/workshop/vehicles/${r.id}/edit` })) },
    // The customer's 360° page (CRM), or the Workshop customer list for people without the CRM.
    { group: 'Customers', hits: customers.map((r) => ({ label: r.fullName, sub: r.phone ?? undefined, href: canCrm ? `/crm/customers/${r.id}` : `/workshop/customers?q=${encodeURIComponent(r.fullName)}` })) },
    { group: 'Parts', hits: parts.filter((r) => opens(['store.view'], r.branchId)).map((r) => ({ label: r.partNumber ?? r.name, sub: r.partNumber ? r.name : undefined, href: `/inventory/parts/${r.id}` })) },
    { group: 'Warranty policies', hits: policies.map((r) => ({ label: r.name, sub: r.code, href: `/warranty/policies/${r.id}` })) },
    { group: 'Warranty providers', hits: providers.map((r) => ({ label: r.name, href: `/warranty/providers/${r.id}` })) },
    { group: 'Meeting rooms', hits: rooms.map((r) => ({ label: r.name, href: '/schedule/rooms' })) },
    { group: 'Branches', hits: branches.map((r) => ({ label: r.name, href: `/branches/${r.id}` })) },
    // Departments are edited on their branch's page.
    { group: 'Departments', hits: departments.map((r) => ({ label: r.name, sub: r.branch?.name, href: `/branches/${r.branchId}` })) },
    { group: 'Staff', hits: staff.map((r) => ({ label: r.fullName, sub: r.email, href: `/users?q=${encodeURIComponent(r.email)}` })) },
  ];
  return groups
    .map((g, i) => ({ g, i, rank: groupRank(plan, g.group) }))
    .filter(({ g }) => g.hits.length > 0)
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map(({ g }) => g);
}
