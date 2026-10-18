'use server';
import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { authorize, allows, orgWhere, myOrganisationId } from '@/lib/authz/server';
import { claimed as stillAsSeen } from '@/lib/integrity';
import { nextDocumentNumber } from '@/lib/zinox/numbering';
import { userNames, nameOf } from '@/lib/zinox/people';
import { actorLabel } from '@/lib/assist/rules';
import { emailColleaguesLater } from '@/lib/workflow-notify';
import { canMoveProject, deliveryProgress, deliveryAllowed, canAcceptDeliverable, milestoneState, awardedThisYear, PROJECT_STATUS_LABEL, PROJECT_LIVE_STATUSES, MILESTONE_DUE_SOON_DAYS, type ProjectStatus, type ProjectKind } from '@/lib/projects-core';
import { lagosYearStart } from '@/lib/service-core';

class ProjectActionError extends Error {}

const DAY = 86_400_000;
const KINDS: ProjectKind[] = ['GOVERNMENT', 'CORPORATE', 'EDUCATION', 'NGO'];

async function audit(userId: string, projectId: string, verb: string, metadata: Record<string, unknown>) {
  await writeAuditLog({ userId, action: `project.${verb}`, entityType: 'Project', entityId: projectId, metadata });
}

/** A project of this person's organisation, with what a change needs (never the browser's word). */
async function projectForChange(projectId: string) {
  const p = await prisma.project.findFirst({ where: { ...(await orgWhere()), id: projectId }, select: { id: true, number: true, name: true, status: true, organisationId: true, managerId: true, customerId: true } });
  if (!p) throw new ProjectActionError('This project is not available — it may have been removed, or it is outside what you can see.');
  return p;
}

// ── Option searches ──────────────────────────────────────────────────────

export async function searchProjectCustomerOptions(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  await authorize('projects.view', undefined, 'searchProjectCustomerOptions');
  const q = query.trim();
  if (!q) return [];
  const rows = await prisma.customer.findMany({
    where: { ...(await orgWhere()), isActive: true, OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { customerCompany: { companyName: { contains: q, mode: 'insensitive' } } }] },
    orderBy: { fullName: 'asc' }, take: 20, select: { id: true, fullName: true, email: true, customerType: true, customerCompany: { select: { companyName: true } } },
  });
  return rows.map((c) => ({ value: c.id, label: c.customerCompany?.companyName ? `${c.customerCompany.companyName} (${c.fullName})` : c.fullName, sublabel: [c.customerType.toLowerCase(), c.email].filter(Boolean).join(' · ') }));
}

export async function searchProjectManagerOptions(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  await authorize('projects.view', undefined, 'searchProjectManagerOptions');
  const q = query.trim();
  const rows = await prisma.user.findMany({
    where: { ...(await orgWhere()), isActive: true, ...(q ? { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { employeeId: { contains: q, mode: 'insensitive' } }] } : { roles: { some: { role: { slug: { in: ['project-manager', 'key-account-manager'] } } } } }) },
    orderBy: { fullName: 'asc' }, take: 25, select: { id: true, fullName: true, employeeId: true, roles: { select: { role: { select: { name: true } } }, take: 2 } },
  });
  return rows.map((u) => ({ value: u.id, label: u.fullName, sublabel: [u.employeeId, u.roles.map((r) => r.role.name).join(', ')].filter(Boolean).join(' · ') || undefined }));
}
export async function loadProjectManagerOptions() {
  return searchProjectManagerOptions('');
}

export async function searchProjectProductOptions(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  await authorize('projects.view', undefined, 'searchProjectProductOptions');
  const q = query.trim();
  if (!q) return [];
  const rows = await prisma.product.findMany({
    where: { ...(await orgWhere()), isActive: true, OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] },
    orderBy: { name: 'asc' }, take: 20, select: { id: true, name: true, sku: true, family: true },
  });
  return rows.map((p) => ({ value: p.id, label: p.name, sublabel: `${p.sku} · ${p.family.toLowerCase().replace(/_/g, ' ')}` }));
}

export async function searchProjectConfigurationOptions(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  await authorize('projects.view', undefined, 'searchProjectConfigurationOptions');
  const q = query.trim();
  if (!q) return [];
  const rows = await prisma.productConfiguration.findMany({
    where: { product: { ...(await orgWhere()), isActive: true }, isActive: true, OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }, { product: { name: { contains: q, mode: 'insensitive' } } }] },
    orderBy: [{ product: { name: 'asc' } }, { name: 'asc' }], take: 20, select: { id: true, name: true, code: true, product: { select: { name: true } } },
  });
  return rows.map((c) => ({ value: c.id, label: `${c.product.name} — ${c.name}`, sublabel: c.code }));
}

// ── Create and read ──────────────────────────────────────────────────────

export type CreateProjectInput = { name: string; customerId: string; kind: string; tenderReference?: string; contractValue: number; startDate?: Date; endDate?: Date; managerId: string; description?: string; status?: 'TENDER' | 'AWARDED' };

export async function createProject(input: CreateProjectInput): Promise<{ id: string; number: string }> {
  const user = await requireUser();
  await authorize('projects.manage', undefined, 'createProject', 'Only a Project Manager can create projects.');
  const name = input.name.trim();
  if (!name) throw new ProjectActionError('Give the project a name.');
  if (!KINDS.includes(input.kind as ProjectKind)) throw new ProjectActionError('Choose the kind of project.');
  if (!Number.isFinite(input.contractValue) || input.contractValue < 0) throw new ProjectActionError('Enter the contract value (0 while still a tender).');
  const [customer, manager] = await Promise.all([
    prisma.customer.findFirst({ where: { ...(await orgWhere()), id: input.customerId }, select: { id: true, fullName: true } }),
    prisma.user.findFirst({ where: { ...(await orgWhere()), id: input.managerId, isActive: true }, select: { id: true, fullName: true } }),
  ]);
  if (!customer) throw new ProjectActionError('Choose the customer (the ministry, company or school).');
  if (!manager) throw new ProjectActionError('Choose the project manager.');
  const startDate = input.startDate ? new Date(input.startDate) : null;
  const endDate = input.endDate ? new Date(input.endDate) : null;
  if (startDate && Number.isNaN(startDate.getTime())) throw new ProjectActionError('Enter a valid start date.');
  if (endDate && Number.isNaN(endDate.getTime())) throw new ProjectActionError('Enter a valid end date.');
  if (startDate && endDate && endDate < startDate) throw new ProjectActionError('The end date is before the start date.');
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new ProjectActionError('Your account is not placed in an organisation yet.');
  const number = await nextDocumentNumber('PRJ', organisationId);
  const status: ProjectStatus = input.status === 'AWARDED' ? 'AWARDED' : 'TENDER';
  const project = await prisma.project.create({
    data: { number, organisationId, name, customerId: customer.id, kind: input.kind as ProjectKind, tenderReference: input.tenderReference?.trim() || null, contractValue: Math.round(input.contractValue * 100) / 100, startDate, endDate, status, managerId: manager.id, description: input.description?.trim() || null, createdById: user.id },
    select: { id: true, number: true },
  });
  await audit(user.id, project.id, 'created', { referenceNumber: number, name, customer: customer.fullName, kind: input.kind, contractValue: input.contractValue, manager: manager.fullName, status });
  if (manager.id !== user.id) {
    emailColleaguesLater({
      branchId: null, organisationId, userIds: [manager.id], exceptUserId: user.id, path: `/projects/${project.id}`, where: 'project.created',
      notice: { subject: `You manage project ${number} — ${name}`, heading: 'A project is yours to run', intro: `${name} for ${customer.fullName} has been recorded with you as its manager.`, facts: [['Project', number], ['Customer', customer.fullName], ['Status', PROJECT_STATUS_LABEL[status]]], next: 'Add the milestones and deliverables, then link its quotations and orders as they come.', status: { label: PROJECT_STATUS_LABEL[status], tone: 'info' }, ctaLabel: 'Open the project' },
    });
  }
  return project;
}

export async function listProjects(options?: { q?: string; status?: string }) {
  const where = await orgWhere();
  const q = options?.q?.trim().slice(0, 100);
  const rows = await prisma.project.findMany({
    where: {
      ...where,
      ...(options?.status && PROJECT_STATUS_LABEL[options.status as ProjectStatus] ? { status: options.status as ProjectStatus } : {}),
      ...(q ? { OR: [{ number: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }, { tenderReference: { contains: q, mode: 'insensitive' } }, { customer: { fullName: { contains: q, mode: 'insensitive' } } }] } : {}),
    },
    orderBy: { createdAt: 'desc' }, take: 200,
    select: { id: true, number: true, name: true, kind: true, status: true, contractValue: true, currency: true, startDate: true, endDate: true, createdAt: true, customer: { select: { id: true, fullName: true } }, manager: { select: { id: true, fullName: true } }, deliverables: { select: { quantity: true, deliveredQuantity: true, acceptedAt: true } }, milestones: { select: { dueDate: true, completedAt: true } } },
  });
  return rows.map((p) => ({ ...p, contractValue: Number(p.contractValue), progress: deliveryProgress(p.deliverables), overdueMilestones: p.milestones.filter((m) => milestoneState(m) === 'OVERDUE').length }));
}

export async function getProjectKpis() {
  const where = await orgWhere();
  const yearStart = lagosYearStart();
  const yearEnd = new Date(`${yearStart.getFullYear() + 1}-01-01T00:00:00+01:00`);
  const soon = new Date(Date.now() + MILESTONE_DUE_SOON_DAYS * DAY);
  const [rows, live, deliveriesDue, milestonesDue] = await Promise.all([
    prisma.project.findMany({ where, select: { status: true, contractValue: true, startDate: true, createdAt: true }, take: 2000 }),
    prisma.project.count({ where: { ...where, status: { in: PROJECT_LIVE_STATUSES } } }),
    prisma.projectDeliverable.count({ where: { project: { ...where, status: { in: PROJECT_LIVE_STATUSES } }, acceptedAt: null } }),
    prisma.projectMilestone.count({ where: { project: { ...where, status: { in: PROJECT_LIVE_STATUSES } }, completedAt: null, dueDate: { lte: soon } } }),
  ]);
  return { awardedThisYear: awardedThisYear(rows, yearStart, yearEnd), live, deliveriesDue, milestonesDue, year: yearStart.getFullYear() };
}

export async function getProject(id: string) {
  const p = await prisma.project.findFirst({
    where: { ...(await orgWhere()), id },
    include: {
      customer: { select: { id: true, fullName: true, email: true, phone: true, customerCompany: { select: { companyName: true } } } },
      manager: { select: { id: true, fullName: true, email: true } },
      milestones: { orderBy: [{ sortOrder: 'asc' }, { dueDate: 'asc' }] },
      deliverables: { orderBy: { id: 'asc' }, include: { product: { select: { id: true, name: true, sku: true } }, configuration: { select: { id: true, name: true, code: true } } } },
      quotations: { orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, number: true, status: true, total: true, createdAt: true } },
      salesOrders: { orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, number: true, status: true, total: true, createdAt: true } },
      buildOrders: { orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, number: true, status: true, quantity: true, createdAt: true, configuration: { select: { name: true, product: { select: { name: true } } } } } },
    },
  });
  if (!p) return null;
  const names = await userNames([p.createdById]);
  return {
    ...p, contractValue: Number(p.contractValue), createdByName: nameOf(names, p.createdById),
    progress: deliveryProgress(p.deliverables),
    milestones: p.milestones.map((m) => ({ ...m, state: milestoneState(m) })),
    deliverables: p.deliverables.map((d) => ({ ...d, canAccept: canAcceptDeliverable(d), outstanding: Math.max(0, d.quantity - d.deliveredQuantity) })),
    quotations: p.quotations.map((q) => ({ ...q, total: Number(q.total) })),
    salesOrders: p.salesOrders.map((o) => ({ ...o, total: Number(o.total) })),
  };
}

export async function getProjectAuditTrail(projectId: string) {
  const p = await prisma.project.findFirst({ where: { ...(await orgWhere()), id: projectId }, select: { id: true } });
  if (!p) return [];
  const entries = await prisma.auditLog.findMany({ where: { entityType: 'Project', entityId: projectId }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, action: true, userId: true, metadata: true, createdAt: true } });
  const names = await userNames(entries.map((e) => e.userId));
  return entries.map((e) => ({ ...e, userName: e.userId ? actorLabel(names.get(e.userId) ?? null, e.metadata) : null }));
}

// ── Milestones ───────────────────────────────────────────────────────────

export async function addProjectMilestone(projectId: string, name: string, dueDate?: Date, notes?: string): Promise<void> {
  const project = await projectForChange(projectId);
  const user = await requireUser();
  await authorize('projects.manage', undefined, 'addProjectMilestone', 'Only a Project Manager can add milestones.');
  const label = name.trim();
  if (!label) throw new ProjectActionError('Name the milestone.');
  if (['CLOSED', 'LOST'].includes(project.status)) throw new ProjectActionError('This project is finished — milestones can no longer be added.');
  const due = dueDate ? new Date(dueDate) : null;
  if (due && Number.isNaN(due.getTime())) throw new ProjectActionError('Enter a valid due date.');
  const count = await prisma.projectMilestone.count({ where: { projectId, project: await orgWhere() } });
  const m = await prisma.projectMilestone.create({ data: { projectId, name: label, dueDate: due, notes: notes?.trim() || null, sortOrder: count + 1 }, select: { id: true } });
  await audit(user.id, projectId, 'milestone_added', { referenceNumber: project.number, milestone: label, milestoneId: m.id, dueDate: due?.toISOString() ?? null });
}

export async function completeProjectMilestone(milestoneId: string): Promise<void> {
  const m = await prisma.projectMilestone.findFirst({ where: { id: milestoneId, project: await orgWhere() }, select: { id: true, name: true, projectId: true, completedAt: true } });
  if (!m) throw new ProjectActionError('Milestone not found.');
  const project = await projectForChange(m.projectId);
  const user = await requireUser();
  await authorize('projects.manage', undefined, 'completeProjectMilestone', 'Only a Project Manager can complete milestones.');
  if (m.completedAt) throw new ProjectActionError('This milestone is already complete.');
  stillAsSeen(await prisma.projectMilestone.updateMany({ where: { id: milestoneId, completedAt: null }, data: { completedAt: new Date() } }));
  await audit(user.id, project.id, 'milestone_completed', { referenceNumber: project.number, milestone: m.name, milestoneId });
}

// ── Deliverables ─────────────────────────────────────────────────────────

export async function addProjectDeliverable(projectId: string, productId: string, quantity: number, configurationId?: string, siteName?: string): Promise<void> {
  const project = await projectForChange(projectId);
  const user = await requireUser();
  await authorize('projects.manage', undefined, 'addProjectDeliverable', 'Only a Project Manager can add deliverables.');
  if (!Number.isInteger(quantity) || quantity <= 0) throw new ProjectActionError('Enter the number of units.');
  if (['CLOSED', 'LOST'].includes(project.status)) throw new ProjectActionError('This project is finished — deliverables can no longer be added.');
  const product = await prisma.product.findFirst({ where: { ...(await orgWhere()), id: productId }, select: { id: true, name: true } });
  if (!product) throw new ProjectActionError('Choose a product from the catalogue.');
  let configuration: { id: string; name: string } | null = null;
  if (configurationId) {
    configuration = await prisma.productConfiguration.findFirst({ where: { id: configurationId, productId: product.id }, select: { id: true, name: true } });
    if (!configuration) throw new ProjectActionError('That configuration does not belong to the chosen product.');
  }
  await prisma.projectDeliverable.create({ data: { projectId, productId: product.id, configurationId: configuration?.id ?? null, quantity, siteName: siteName?.trim() || null } });
  await audit(user.id, projectId, 'deliverable_added', { referenceNumber: project.number, product: product.name, configuration: configuration?.name ?? null, quantity, site: siteName?.trim() || null });
}

export async function recordProjectDelivery(deliverableId: string, quantity: number): Promise<void> {
  const d = await prisma.projectDeliverable.findFirst({ where: { id: deliverableId, project: await orgWhere() }, select: { id: true, projectId: true, quantity: true, deliveredQuantity: true, acceptedAt: true, siteName: true, product: { select: { name: true } } } });
  if (!d) throw new ProjectActionError('Deliverable not found.');
  const project = await projectForChange(d.projectId);
  const user = await requireUser();
  await authorize('projects.manage', undefined, 'recordProjectDelivery', 'Only a Project Manager records deliveries.');
  const check = deliveryAllowed(d, quantity);
  if (!check.ok) throw new ProjectActionError(check.reason ?? 'Cannot record this delivery.');
  if (d.acceptedAt) throw new ProjectActionError('This deliverable has been accepted — it cannot change.');
  // Compare-and-set on the quantity seen, so two people recording at once never over-deliver.
  stillAsSeen(await prisma.projectDeliverable.updateMany({ where: { id: deliverableId, deliveredQuantity: d.deliveredQuantity }, data: { deliveredQuantity: { increment: quantity } } }));
  await audit(user.id, project.id, 'delivery_recorded', { referenceNumber: project.number, product: d.product.name, site: d.siteName, quantity, nowDelivered: d.deliveredQuantity + quantity, of: d.quantity });
}

export async function acceptProjectDeliverable(deliverableId: string): Promise<void> {
  const d = await prisma.projectDeliverable.findFirst({ where: { id: deliverableId, project: await orgWhere() }, select: { id: true, projectId: true, quantity: true, deliveredQuantity: true, acceptedAt: true, siteName: true, product: { select: { name: true } } } });
  if (!d) throw new ProjectActionError('Deliverable not found.');
  const project = await projectForChange(d.projectId);
  const user = await requireUser();
  await authorize('projects.manage', undefined, 'acceptProjectDeliverable', 'Only a Project Manager records acceptance.');
  if (!canAcceptDeliverable(d)) throw new ProjectActionError(d.acceptedAt ? 'Already accepted.' : 'Every unit must be delivered before the customer accepts it.');
  stillAsSeen(await prisma.projectDeliverable.updateMany({ where: { id: deliverableId, acceptedAt: null }, data: { acceptedAt: new Date() } }));
  await audit(user.id, project.id, 'deliverable_accepted', { referenceNumber: project.number, product: d.product.name, site: d.siteName, quantity: d.quantity });
}

// ── Status ───────────────────────────────────────────────────────────────

export async function moveProjectStatus(projectId: string, to: string, note?: string): Promise<void> {
  const project = await projectForChange(projectId);
  const user = await requireUser();
  await authorize('projects.manage', undefined, 'moveProjectStatus', 'Only a Project Manager moves a project along.');
  const target = to as ProjectStatus;
  if (!PROJECT_STATUS_LABEL[target]) throw new ProjectActionError('Choose where the project goes next.');
  if (!canMoveProject(project.status as ProjectStatus, target)) throw new ProjectActionError(`${project.number} is ${PROJECT_STATUS_LABEL[project.status as ProjectStatus].toLowerCase()} — it cannot move to "${PROJECT_STATUS_LABEL[target]}" from there.`);
  if (target === 'ACCEPTED') {
    const pending = await prisma.projectDeliverable.count({ where: { projectId, acceptedAt: null } });
    if (pending) throw new ProjectActionError(`${pending} ${pending === 1 ? 'deliverable has' : 'deliverables have'} not been accepted yet.`);
  }
  if (target === 'AWARDED') {
    const p = await prisma.project.findFirst({ where: { ...(await orgWhere()), id: projectId }, select: { contractValue: true } });
    if (!p || Number(p.contractValue) <= 0) throw new ProjectActionError('Record the contract value before marking the project as awarded.');
  }
  stillAsSeen(await prisma.project.updateMany({ where: { id: projectId, status: project.status as ProjectStatus }, data: { status: target } }));
  await audit(user.id, projectId, `status_${target.toLowerCase()}`, { referenceNumber: project.number, from: project.status, to: target, note: note?.trim().slice(0, 300) || null });
}

export async function updateProjectDetails(projectId: string, input: { contractValue?: number; tenderReference?: string; startDate?: Date | null; endDate?: Date | null; description?: string }): Promise<void> {
  const project = await projectForChange(projectId);
  const user = await requireUser();
  await authorize('projects.manage', undefined, 'updateProjectDetails', 'Only a Project Manager edits a project.');
  const data: Record<string, unknown> = {};
  if (input.contractValue !== undefined) {
    if (!Number.isFinite(input.contractValue) || input.contractValue < 0) throw new ProjectActionError('Enter the contract value.');
    data.contractValue = Math.round(input.contractValue * 100) / 100;
  }
  if (input.tenderReference !== undefined) data.tenderReference = input.tenderReference.trim() || null;
  if (input.startDate !== undefined) data.startDate = input.startDate;
  if (input.endDate !== undefined) data.endDate = input.endDate;
  if (input.description !== undefined) data.description = input.description.trim() || null;
  await prisma.project.updateMany({ where: { ...(await orgWhere()), id: projectId }, data });
  await audit(user.id, projectId, 'updated', { referenceNumber: project.number, changes: data });
}

// ── Dashboard and glance ─────────────────────────────────────────────────

/** Milestones due within 7 days (or overdue) on live projects this person manages. */
export async function getProjectsDashboardItems(): Promise<{ id: string; title: string; detail: string; url: string; createdAt: Date }[]> {
  if (!(await allows('projects.view'))) return [];
  const user = await requireUser();
  const soon = new Date(Date.now() + MILESTONE_DUE_SOON_DAYS * DAY);
  const rows = await prisma.projectMilestone.findMany({
    where: { completedAt: null, dueDate: { lte: soon }, project: { ...(await orgWhere()), managerId: user.id, status: { in: PROJECT_LIVE_STATUSES } } },
    orderBy: { dueDate: 'asc' }, take: 10,
    select: { id: true, name: true, dueDate: true, completedAt: true, project: { select: { id: true, number: true, name: true } } },
  });
  return rows.map((m) => ({
    id: `project-milestone-${m.id}`,
    title: `${milestoneState(m) === 'OVERDUE' ? 'Overdue' : 'Due soon'}: ${m.name} — ${m.project.number}`,
    detail: `${m.project.name}${m.dueDate ? ` · due ${new Date(m.dueDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' })}` : ''}`,
    url: `/projects/${m.project.id}`,
    createdAt: m.dueDate ?? new Date(),
  }));
}

export type ProjectsGlanceTile = { label: string; value: number; hint: string; href: string; tone: 'primary' | 'info' | 'warning' | 'error' | 'success' | 'muted' };

export async function getProjectsGlance(): Promise<ProjectsGlanceTile[]> {
  if (!(await allows('projects.view'))) return [];
  const k = await getProjectKpis().catch(() => null);
  if (!k) return [];
  return [
    { label: 'Projects live', value: k.live, hint: 'Awarded or being delivered', href: '/projects?status=IN_PROGRESS', tone: 'primary' },
    { label: 'Deliveries outstanding', value: k.deliveriesDue, hint: 'Deliverables not yet accepted', href: '/projects', tone: k.deliveriesDue ? 'info' : 'muted' },
    { label: 'Milestones due', value: k.milestonesDue, hint: `Within ${MILESTONE_DUE_SOON_DAYS} days or overdue`, href: '/projects', tone: k.milestonesDue ? 'warning' : 'muted' },
  ];
}
