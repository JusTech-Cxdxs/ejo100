'use server';

import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { platformModules } from '@/lib/modules';

export type SearchHit = { label: string; sub?: string; href: string };
export type SearchGroup = { group: string; hits: SearchHit[] };

const ADMIN_PAGES = ['organisation', 'business-units', 'countries', 'states', 'cities', 'branches', 'departments', 'teams', 'users', 'roles', 'permissions', 'audit-logs', 'module-registry', 'branding', 'settings'];
const MORE_PAGES: SearchHit[] = [
  { label: 'Job Cards', href: '/workshop/job-cards' }, { label: 'Vehicle Services', href: '/workshop/vehicle-service' }, { label: 'Vehicles', href: '/workshop/vehicles' },
  { label: 'Customers', href: '/workshop/customers' }, { label: 'In custody', href: '/workshop/custody' }, { label: 'Parts', href: '/inventory/parts' },
  { label: 'Goods receipts', href: '/inventory/goods-receipts' }, { label: 'Inventory analytics', href: '/inventory/analytics' }, { label: 'Parts requests (PRS)', href: '/workshop/parts-requests' },
  { label: 'External procurement (EPR)', href: '/workshop/external-procurement' }, { label: 'Warranty claims', href: '/warranty/claims' }, { label: 'Visitors', href: '/security/visitors' },
  { label: 'Exit passes', href: '/security/exit-passes' }, { label: 'Road tests', href: '/security/road-tests' }, { label: 'Incidents', href: '/security/incidents' },
  { label: 'Deliveries', href: '/security/deliveries' }, { label: 'Contractors', href: '/security/contractors' }, { label: 'Calendar', href: '/schedule/calendar' },
  { label: 'Appointments', href: '/schedule/appointments' }, { label: 'Notification Center', href: '/notifications' }, { label: 'Broadcasts', href: '/notifications/broadcasts' },
];

/**
 * The header's master search: every module at once, grouped, each hit a
 * direct link. One parallel round of small indexed queries (5 per group).
 * Admin pages and staff records only for administrators; every page still
 * checks permission when opened, so search never reveals more than that.
 */
export async function globalSearch(raw: string): Promise<SearchGroup[]> {
  const user = await requireUser();
  const q = raw.trim().slice(0, 60);
  if (!q) return [];
  const roles = await prisma.userRole.findMany({ where: { userId: user.id }, select: { role: { select: { slug: true, isSuperAdmin: true } } } });
  const isAdmin = roles.some((r: { role: { slug: string; isSuperAdmin: boolean } }) => r.role.isSuperAdmin || r.role.slug === 'administrator');
  // One letter: match beginnings only (cheap, relevant); two or more: anywhere.
  const m = (field: string) => (q.length < 2 ? { [field]: { startsWith: q, mode: 'insensitive' as const } } : { [field]: { contains: q, mode: 'insensitive' as const } });
  const take = 5;
  const lower = q.toLowerCase();
  const pages: SearchHit[] = [
    ...platformModules.filter((x) => x.status === 'LIVE' && (isAdmin || !ADMIN_PAGES.includes(x.key)) && x.name.toLowerCase().includes(lower)).map((x) => ({ label: x.name, sub: 'Module', href: x.href })),
    ...MORE_PAGES.filter((x) => x.label.toLowerCase().includes(lower)),
  ].slice(0, 6);
  const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
  const [jcs, svs, vehicles, customers, parts, prs, eprs, grns, warranties, claims, visits, passes, tests, incidents, deliveries, contractors, appts, broadcasts, staff] = await Promise.all([
    safe(prisma.jobCard.findMany({ where: { OR: [m('jobNumber'), { customer: m('fullName') }, { vehicle: m('plateNumber') }] }, take, orderBy: { createdAt: 'desc' }, select: { id: true, jobNumber: true, status: true, customer: { select: { fullName: true } } } })),
    safe(prisma.vehicleService.findMany({ where: { OR: [m('serviceNumber'), { customer: m('fullName') }, { vehicle: m('plateNumber') }] }, take, orderBy: { createdAt: 'desc' }, select: { id: true, serviceNumber: true, status: true, customer: { select: { fullName: true } } } })),
    safe(prisma.customerVehicle.findMany({ where: { OR: [m('make'), m('model'), m('plateNumber'), m('chassisNumber')] }, take, select: { id: true, make: true, model: true, plateNumber: true } })),
    safe(prisma.customer.findMany({ where: { OR: [m('fullName'), m('phone')] }, take, select: { id: true, fullName: true, phone: true } })),
    safe(prisma.part.findMany({ where: { OR: [m('partNumber'), m('name')] }, take, select: { id: true, partNumber: true, name: true } })),
    safe(prisma.partRequestSlip.findMany({ where: m('referenceNumber'), take, orderBy: { createdAt: 'desc' }, select: { id: true, referenceNumber: true, status: true } })),
    safe(prisma.externalProcurementRequest.findMany({ where: m('referenceNumber'), take, orderBy: { createdAt: 'desc' }, select: { id: true, referenceNumber: true, status: true } })),
    safe(prisma.goodsReceipt.findMany({ where: { OR: [m('referenceNumber'), m('supplierName')] }, take, orderBy: { receivedAt: 'desc' }, select: { id: true, referenceNumber: true, supplierName: true } })),
    safe(prisma.warranty.findMany({ where: m('warrantyNumber'), take, select: { id: true, warrantyNumber: true } })),
    safe(prisma.warrantyClaim.findMany({ where: m('claimNumber'), take, select: { id: true, claimNumber: true, status: true } })),
    safe(prisma.visit.findMany({ where: { OR: [m('visitNumber'), m('visitorName'), m('company')] }, take, orderBy: { createdAt: 'desc' }, select: { id: true, visitNumber: true, visitorName: true } })),
    safe(prisma.exitPass.findMany({ where: m('passNumber'), take, orderBy: { createdAt: 'desc' }, select: { id: true, passNumber: true } })),
    safe(prisma.roadTestPermit.findMany({ where: m('permitNumber'), take, orderBy: { createdAt: 'desc' }, select: { id: true, permitNumber: true } })),
    safe(prisma.securityIncident.findMany({ where: { OR: [m('incidentNumber'), m('type')] }, take, orderBy: { createdAt: 'desc' }, select: { id: true, incidentNumber: true, type: true } })),
    safe(prisma.gateDelivery.findMany({ where: { OR: [m('deliveryNumber'), m('supplierName')] }, take, orderBy: { createdAt: 'desc' }, select: { id: true, deliveryNumber: true, supplierName: true } })),
    safe(prisma.contractorPass.findMany({ where: { OR: [m('passNumber'), m('company')] }, take, orderBy: { createdAt: 'desc' }, select: { id: true, passNumber: true, company: true } })),
    safe(prisma.appointment.findMany({ where: { OR: [m('appointmentNumber'), m('title')] }, take, orderBy: { startsAt: 'desc' }, select: { id: true, appointmentNumber: true, title: true } })),
    safe(prisma.broadcast.findMany({ where: { OR: [m('broadcastNumber'), m('title')] }, take, orderBy: { createdAt: 'desc' }, select: { id: true, broadcastNumber: true, title: true } })),
    isAdmin ? safe(prisma.user.findMany({ where: { OR: [m('fullName'), m('email'), m('employeeId')] }, take, select: { id: true, fullName: true, email: true } })) : Promise.resolve([]),
  ]);
  const words = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const groups: SearchGroup[] = [
    { group: 'Pages', hits: pages },
    { group: 'Job Cards', hits: jcs.map((r) => ({ label: r.jobNumber, sub: `${r.customer.fullName} · ${words(r.status)}`, href: `/workshop/job-cards/${r.id}` })) },
    { group: 'Vehicle Services', hits: svs.map((r) => ({ label: r.serviceNumber, sub: `${r.customer.fullName} · ${words(r.status)}`, href: `/workshop/vehicle-service/${r.id}` })) },
    { group: 'Vehicles', hits: vehicles.map((r) => ({ label: [r.make, r.model].filter(Boolean).join(' ') || 'Vehicle', sub: r.plateNumber ?? undefined, href: `/workshop/vehicles/${r.id}/edit` })) },
    { group: 'Customers', hits: customers.map((r) => ({ label: r.fullName, sub: r.phone ?? undefined, href: `/workshop/customers?q=${encodeURIComponent(r.fullName)}` })) },
    { group: 'Parts', hits: parts.map((r) => ({ label: r.partNumber ?? '—', sub: r.name, href: `/inventory/parts/${r.id}` })) },
    { group: 'Parts requests', hits: prs.map((r) => ({ label: r.referenceNumber, sub: words(r.status), href: `/workshop/parts-requests/${r.id}` })) },
    { group: 'External procurement', hits: eprs.map((r) => ({ label: r.referenceNumber, sub: words(r.status), href: `/workshop/external-procurement/${r.id}` })) },
    { group: 'Goods receipts', hits: grns.map((r) => ({ label: r.referenceNumber, sub: r.supplierName, href: `/inventory/goods-receipts/${r.id}` })) },
    { group: 'Warranties', hits: warranties.map((r) => ({ label: r.warrantyNumber, href: `/warranty/${r.id}` })) },
    { group: 'Warranty claims', hits: claims.map((r) => ({ label: r.claimNumber, sub: words(r.status), href: `/warranty/claims/${r.id}` })) },
    { group: 'Visitors', hits: visits.map((r) => ({ label: r.visitNumber, sub: r.visitorName, href: `/security/visitors/${r.id}` })) },
    { group: 'Exit passes', hits: passes.map((r) => ({ label: r.passNumber, href: `/security/exit-passes/${r.id}` })) },
    { group: 'Road tests', hits: tests.map((r) => ({ label: r.permitNumber, href: `/security/road-tests/${r.id}` })) },
    { group: 'Incidents', hits: incidents.map((r) => ({ label: r.incidentNumber, sub: r.type, href: `/security/incidents/${r.id}` })) },
    { group: 'Deliveries', hits: deliveries.map((r) => ({ label: r.deliveryNumber, sub: r.supplierName, href: `/security/deliveries/${r.id}` })) },
    { group: 'Contractors', hits: contractors.map((r) => ({ label: r.passNumber, sub: r.company, href: `/security/contractors/${r.id}` })) },
    { group: 'Appointments', hits: appts.map((r) => ({ label: r.appointmentNumber, sub: r.title, href: `/schedule/${r.id}` })) },
    { group: 'Broadcasts', hits: broadcasts.map((r) => ({ label: r.broadcastNumber, sub: r.title, href: `/notifications/broadcasts/${r.id}` })) },
    { group: 'Staff', hits: (staff as { id: string; fullName: string; email: string }[]).map((r) => ({ label: r.fullName, sub: r.email, href: '/users' })) },
  ];
  return groups.filter((g) => g.hits.length > 0);
}
