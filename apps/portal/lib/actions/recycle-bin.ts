'use server';

import { prisma, type Prisma } from '@ejo/database';
import { requireUser } from '@/lib/actions/workshop';
import { allows, authorize, currentAssist, getPrincipal, inMyOrganisation, NOT_AVAILABLE, orgWhere, reachWhere, refuse, refuseDuringAssist, seeJobCard, seePart, seeService, seeVehicle } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { binRecord, eligibilityOf, moveToBin, purgeItems, restoreFromBin, RETENTION_DAYS, type BinRecord } from '@/lib/recycle-bin/server';
import { BIN_KIND, binHref, binState, cleanReason, daysLeft, isBinEntity, JOB_DELETE_REFUSED, mayDeleteJob, mayDeleteOther, type BinEntity, type BinState, type DeleterRights } from '@/lib/recycle-bin/rules';

/**
 * Recycle bin actions. Moving a record to the bin needs the right to remove
 * that kind of record AND the record to be free of consequences (checked
 * again under a row lock in lib/recycle-bin/server.ts). Restoring needs
 * admin.recycle_bin.manage in the record's organisation. Permanent removal
 * before the retention period ends is for the platform team only.
 */

class RecycleBinActionError extends Error {}

/** Out of the person's organisation or reach behaves exactly like "not found". */
async function fence(rec: BinRecord, where: string): Promise<void> {
  if (!(await inMyOrganisation(rec.organisationId))) throw new RecycleBinActionError(NOT_AVAILABLE);
  if (rec.entity === 'JobCard') await seeJobCard(rec.id, where);
  else if (rec.entity === 'VehicleService') await seeService(rec.id, where);
  else if (rec.entity === 'CustomerVehicle') await seeVehicle(rec.id, where);
  else if (rec.entity === 'Part') await seePart(rec.id, where);
}

async function rightsFor(rec: BinRecord): Promise<DeleterRights> {
  const p = await getPrincipal();
  const at = { branchId: rec.branchId };
  const manageBin = await allows('admin.recycle_bin.manage', at);
  let ownerRight = false;
  let openJobs = false;
  if (rec.entity === 'JobCard' || rec.entity === 'VehicleService') {
    ownerRight = await allows('workshop.close.approve', at);
    openJobs = await allows('workshop.job_card.create', at);
  } else if (rec.entity === 'Customer') ownerRight = await allows('crm.manage');
  else if (rec.entity === 'CustomerVehicle') ownerRight = (await allows('workshop.customer.manage')) || (await allows('crm.manage'));
  else ownerRight = await allows('store.parts.manage', at);
  return { userId: p.userId, isSuperAdmin: p.isSuperAdmin, manageBin, ownerRight, openJobs };
}

function mayDelete(rec: BinRecord, r: DeleterRights, now: Date): boolean {
  if (rec.entity === 'JobCard' || rec.entity === 'VehicleService') return mayDeleteJob(r, { createdById: rec.createdById ?? '', createdAt: rec.createdAt }, now);
  return mayDeleteOther(r);
}

export type BinOffer =
  | { mode: 'form'; reference: string; noun: string; days: number; creatorWindow: boolean }
  | { mode: 'note'; noun: string; message: string }
  | { mode: 'none' };

/** Whether a record page offers "Delete (created by mistake)" to this person:
 * the form when allowed and eligible, a short note for managers when the
 * record has history and must go through its own workflow, else nothing. */
export async function getRecycleBinOffer(entity: BinEntity, id: string): Promise<BinOffer> {
  try {
    await requireUser();
    if (!isBinEntity(entity) || (await currentAssist())) return { mode: 'none' };
    const rec = await binRecord(entity, id);
    if (!rec || !(await inMyOrganisation(rec.organisationId))) return { mode: 'none' };
    const rights = await rightsFor(rec);
    const now = new Date();
    const allowed = mayDelete(rec, rights, now);
    const manager = rights.isSuperAdmin || rights.manageBin || rights.ownerRight;
    if (!allowed && !manager) return { mode: 'none' };
    const check = await eligibilityOf(entity, id);
    if (!check) return { mode: 'none' };
    const noun = BIN_KIND[entity].noun;
    if (check.eligible && allowed) return { mode: 'form', reference: rec.reference, noun, days: RETENTION_DAYS(), creatorWindow: !manager };
    // A finished job needs no advice: there is nothing left to cancel.
    return manager && !check.eligible && !check.finished ? { mode: 'note', noun, message: check.message } : { mode: 'none' };
  } catch {
    return { mode: 'none' };
  }
}

/** Moves a record created by mistake to the Recycle bin, with the reason. */
export async function moveToRecycleBin(entity: BinEntity, id: string, reasonRaw: string): Promise<{ reference: string; days: number }> {
  const user = await requireUser();
  await refuseDuringAssist('moveToRecycleBin');
  if (!isBinEntity(entity)) throw new RecycleBinActionError(NOT_AVAILABLE);
  const reason = cleanReason(reasonRaw);
  if (!reason.ok) throw new RecycleBinActionError(reason.message);
  const rec = await binRecord(entity, id);
  if (!rec) throw new RecycleBinActionError(NOT_AVAILABLE);
  await fence(rec, 'moveToRecycleBin');
  const rights = await rightsFor(rec);
  if (!mayDelete(rec, rights, new Date())) {
    const noun = BIN_KIND[entity].noun;
    return refuse('admin.recycle_bin.manage', 'moveToRecycleBin', entity === 'JobCard' || entity === 'VehicleService' ? `You can't delete this ${noun}. ${JOB_DELETE_REFUSED}` : `You don't have permission to delete this ${noun.toLowerCase()}.`);
  }
  const moved = await moveToBin(entity, id, reason.reason, user.id);
  await writeAuditLog({
    userId: user.id,
    action: `${BIN_KIND[entity].audit}.moved_to_recycle_bin`,
    entityType: entity,
    entityId: id,
    organisationId: rec.organisationId,
    metadata: { reference: rec.reference, label: rec.label, reason: reason.reason, recycleBinItemId: moved.itemId, restorableUntil: moved.purgeAfter.toISOString(), ...(entity === 'Customer' ? { actor: 'staff' } : {}) },
  });
  return { reference: rec.reference, days: RETENTION_DAYS() };
}

/** Restores an item within the retention period (organisation administrators). */
export async function restoreFromRecycleBin(itemId: string): Promise<{ entity: BinEntity; entityId: string; reference: string; originalReference: string; changed: boolean; notes: string[] }> {
  const user = await requireUser();
  await refuseDuringAssist('restoreFromRecycleBin');
  const item = itemId ? await prisma.recycleBinItem.findUnique({ where: { id: itemId }, select: { organisationId: true, branchId: true } }) : null;
  if (!item || !(await inMyOrganisation(item.organisationId))) throw new RecycleBinActionError(NOT_AVAILABLE);
  await authorize('admin.recycle_bin.manage', { branchId: item.branchId }, 'restoreFromRecycleBin', 'Only administrators can restore from the Recycle bin.');
  const res = await restoreFromBin(itemId, user.id);
  await writeAuditLog({
    userId: user.id,
    action: `${BIN_KIND[res.entity].audit}.restored_from_recycle_bin`,
    entityType: res.entity,
    entityId: res.entityId,
    organisationId: res.organisationId,
    metadata: { reference: res.reference, ...(res.changed ? { previousReference: res.originalReference } : {}), recycleBinItemId: itemId, notes: res.notes, ...(res.entity === 'Customer' ? { actor: 'staff' } : {}) },
  });
  return { entity: res.entity, entityId: res.entityId, reference: res.reference, originalReference: res.originalReference, changed: res.changed, notes: res.notes };
}

async function auditPurges(items: Awaited<ReturnType<typeof purgeItems>>, userId: string | null, early: boolean): Promise<void> {
  for (const it of items) {
    await writeAuditLog({ userId, action: 'recycle_bin.purged', entityType: 'RecycleBinItem', entityId: it.id, organisationId: it.organisationId, metadata: { entityType: it.entityType, entityId: it.entityId, ...(early ? { beforeTimeRanOut: true } : {}) } });
  }
}

/** Platform team: permanently remove chosen items now (even before their time runs out). */
export async function purgeRecycleBinItems(ids: string[]): Promise<number> {
  const user = await requireUser();
  await refuseDuringAssist('purgeRecycleBinItems');
  const p = await getPrincipal();
  if (!p.isSuperAdmin) return refuse('admin.recycle_bin.manage', 'purgeRecycleBinItems', 'Only the platform team can remove items permanently.');
  const chosen = [...new Set((ids ?? []).filter((x) => typeof x === 'string' && x.length > 0))].slice(0, 500);
  if (chosen.length === 0) throw new RecycleBinActionError('Choose at least one item to remove.');
  const now = new Date();
  const done = await purgeItems({ ids: chosen }, user.id, now);
  for (const d of done) await auditPurges([d], user.id, d.purgeAfter.getTime() > now.getTime());
  return done.length;
}

/** Platform team: permanently remove every item whose time has run out. */
export async function purgeExpiredRecycleBinItems(): Promise<number> {
  const user = await requireUser();
  await refuseDuringAssist('purgeExpiredRecycleBinItems');
  const p = await getPrincipal();
  if (!p.isSuperAdmin) return refuse('admin.recycle_bin.manage', 'purgeExpiredRecycleBinItems', 'Only the platform team can remove items permanently.');
  const done = await purgeItems({ expiredBy: new Date() }, user.id);
  await auditPurges(done, user.id, false);
  return done.length;
}

export type RecycleBinRow = {
  id: string;
  entityType: BinEntity;
  noun: string;
  entityId: string;
  reference: string;
  label: string;
  reason: string;
  deletedBy: string;
  deletedAt: Date;
  purgeAfter: Date;
  daysLeft: number;
  state: BinState;
  restoredAt: Date | null;
  restoredBy: string | null;
  restoredReference: string | null;
  purgedAt: Date | null;
  purgedBy: string | null;
  organisation: string | null;
  /** Where the record lives again, once restored. */
  href: string | null;
};

const STATES = ['in_bin', 'expired', 'restored', 'purged', 'all'] as const;
export type BinFilter = { q?: string; type?: string; state?: string; org?: string; cursor?: string };


/** The bin for this person: their organisation (branch administrators: their
 * branch, plus customers and vehicles); the platform team: every organisation. */
export async function listRecycleBin(filter: BinFilter = {}): Promise<{
  rows: RecycleBinRow[]; nextCursor: string | null; isPlatform: boolean; counts: { inBin: number; expired: number }; organisations: { id: string; name: string }[]; days: number;
}> {
  await requireUser();
  await authorize('admin.recycle_bin.manage', undefined, 'listRecycleBin');
  const p = await getPrincipal();
  const now = new Date();
  const reach = await reachWhere('admin.recycle_bin.manage');
  const fenceWhere: Prisma.RecycleBinItemWhereInput = {
    ...(await orgWhere()),
    ...(p.isSuperAdmin && filter.org ? { organisationId: filter.org } : {}),
    ...(reach.branchId ? { OR: [{ branchId: reach.branchId }, { branchId: null }] } : {}),
  };
  const state = (STATES as readonly string[]).includes(filter.state ?? '') ? filter.state! : 'in_bin';
  const stateWhere: Prisma.RecycleBinItemWhereInput =
    state === 'in_bin' ? { restoredAt: null, purgedAt: null, purgeAfter: { gt: now } }
      : state === 'expired' ? { restoredAt: null, purgedAt: null, purgeAfter: { lte: now } }
        : state === 'restored' ? { restoredAt: { not: null } }
          : state === 'purged' ? { purgedAt: { not: null } }
            : {};
  const q = filter.q?.trim();
  const where: Prisma.RecycleBinItemWhereInput = {
    AND: [
      fenceWhere,
      stateWhere,
      isBinEntity(filter.type) ? { entityType: filter.type } : {},
      q ? { OR: [{ label: { contains: q, mode: 'insensitive' } }, { reference: { contains: q, mode: 'insensitive' } }, { reason: { contains: q, mode: 'insensitive' } }] } : {},
    ],
  };
  const take = 50;
  const items = await prisma.recycleBinItem.findMany({
    where,
    orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    select: { id: true, organisationId: true, entityType: true, entityId: true, reference: true, label: true, reason: true, deletedById: true, deletedAt: true, purgeAfter: true, restoredAt: true, restoredById: true, restoredReference: true, purgedAt: true, purgedById: true },
  });
  const page = items.slice(0, take);
  const userIds = [...new Set(page.flatMap((i) => [i.deletedById, i.restoredById, i.purgedById]).filter((x): x is string => Boolean(x)))];
  const [users, orgs, inBin, expired] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }) : Promise.resolve([]),
    p.isSuperAdmin ? prisma.organisation.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }) : Promise.resolve([]),
    prisma.recycleBinItem.count({ where: { AND: [fenceWhere, { restoredAt: null, purgedAt: null, purgeAfter: { gt: now } }] } }),
    prisma.recycleBinItem.count({ where: { AND: [fenceWhere, { restoredAt: null, purgedAt: null, purgeAfter: { lte: now } }] } }),
  ]);
  const name = new Map(users.map((u) => [u.id, u.fullName]));
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const rows: RecycleBinRow[] = page.filter((i) => isBinEntity(i.entityType)).map((i) => {
    const entity = i.entityType as BinEntity;
    const st = binState(i, now);
    return {
      id: i.id, entityType: entity, noun: BIN_KIND[entity].noun, entityId: i.entityId, reference: i.reference, label: i.label, reason: i.reason,
      deletedBy: name.get(i.deletedById) ?? 'A former colleague', deletedAt: i.deletedAt, purgeAfter: i.purgeAfter, daysLeft: daysLeft(i.purgeAfter, now), state: st,
      restoredAt: i.restoredAt, restoredBy: i.restoredById ? name.get(i.restoredById) ?? null : null, restoredReference: i.restoredReference,
      purgedAt: i.purgedAt, purgedBy: i.purgedById ? name.get(i.purgedById) ?? 'Platform team' : i.purgedAt ? 'Automatic clean-up' : null,
      organisation: p.isSuperAdmin ? orgName.get(i.organisationId) ?? null : null,
      href: st === 'RESTORED' ? binHref(entity, i.entityId) : null,
    };
  });
  return { rows, nextCursor: items.length > take ? page[page.length - 1]!.id : null, isPlatform: p.isSuperAdmin, counts: { inBin, expired }, organisations: orgs, days: RETENTION_DAYS() };
}
