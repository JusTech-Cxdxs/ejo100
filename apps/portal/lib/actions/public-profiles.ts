'use server';

import { prisma } from '@ejo/database';
import { authorize, myOrganisationId, refuseDuringAssist } from '@/lib/authz/server';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { checkProfile, type ProfileInput } from '@/lib/organisation/people-core';

/**
 * The people the organisation publishes (Organisation → People we publish):
 * its leadership and heads of department, with their titles, a short
 * biography and a public profile link. Enyo answers "who is …" questions
 * from this list — in the staff portal always, on the website and in the
 * customer portal only for people marked public. No contact details are kept.
 *
 * admin.organisation.manage, the person's own organisation only (profileOrg),
 * refused in an assisted session, every change in the audit trail.
 */

class PeopleError extends Error {}
const PERM = 'admin.organisation.manage' as const;

async function profileOrg(where: string): Promise<{ organisationId: string; userId: string }> {
  await authorize(PERM, undefined, where, 'Only administrators manage the people the organisation publishes.');
  const user = await requireUser();
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new PeopleError('This account is not placed in an organisation yet.');
  return { organisationId, userId: user.id };
}

export type PublicProfileRow = { id: string; name: string; title: string; area: string | null; bio: string | null; profileUrl: string | null; isPublic: boolean; sortOrder: number; updatedAt: Date };

export async function listPublicProfiles(): Promise<{ rows: PublicProfileRow[]; areas: string[] }> {
  const { organisationId } = await profileOrg('people.list');
  const [rows, units, departments] = await Promise.all([
    prisma.publicProfile.findMany({ where: { organisationId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], take: 200, select: { id: true, name: true, title: true, area: true, bio: true, profileUrl: true, isPublic: true, sortOrder: true, updatedAt: true } }),
    prisma.businessUnit.findMany({ where: { organisationId, isActive: true }, orderBy: { name: 'asc' }, take: 50, select: { name: true } }),
    prisma.department.findMany({ where: { branch: { businessUnit: { organisationId } } }, orderBy: { name: 'asc' }, take: 200, select: { name: true } }).catch(() => []),
  ]);
  const areas = [...new Set(['Group', ...units.map((u) => u.name), ...departments.map((d) => d.name)])];
  return { rows, areas };
}

export async function savePublicProfile(id: string | null, input: ProfileInput): Promise<string> {
  const { organisationId, userId } = await profileOrg('people.save');
  await refuseDuringAssist('people.save');
  const checked = checkProfile(input);
  if (!checked.ok) throw new PeopleError(checked.message);
  const v = checked.value;
  if (id) {
    const res = await prisma.publicProfile.updateMany({ where: { id, organisationId }, data: { ...v, updatedById: userId } });
    if (!res.count) throw new PeopleError('That person is no longer on the list. Refresh the page.');
  } else {
    const count = await prisma.publicProfile.count({ where: { organisationId } });
    if (count >= 200) throw new PeopleError('The list holds at most 200 people. Remove someone first.');
    const last = await prisma.publicProfile.findFirst({ where: { organisationId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const row = await prisma.publicProfile.create({ data: { ...v, organisationId, sortOrder: (last?.sortOrder ?? 0) + 10, createdById: userId, updatedById: userId }, select: { id: true } });
    id = row.id;
  }
  await writeAuditLog({ userId, action: 'organisation.people_saved', entityType: 'PublicProfile', entityId: id, metadata: { title: v.title, isPublic: v.isPublic } });
  return id;
}

export async function removePublicProfile(id: string): Promise<void> {
  const { organisationId, userId } = await profileOrg('people.remove');
  await refuseDuringAssist('people.remove');
  const res = await prisma.publicProfile.deleteMany({ where: { id, organisationId } });
  if (!res.count) throw new PeopleError('That person is no longer on the list.');
  await writeAuditLog({ userId, action: 'organisation.people_removed', entityType: 'PublicProfile', entityId: id, metadata: {} });
}

/** Moves a person one place up or down the list (the order Enyo and the page use). */
export async function movePublicProfile(id: string, direction: 'up' | 'down'): Promise<void> {
  const { organisationId, userId } = await profileOrg('people.move');
  await refuseDuringAssist('people.move');
  const rows = await prisma.publicProfile.findMany({ where: { organisationId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true } });
  const at = rows.findIndex((r) => r.id === id);
  if (at === -1) throw new PeopleError('That person is no longer on the list.');
  const to = direction === 'up' ? at - 1 : at + 1;
  if (to < 0 || to >= rows.length) return;
  const order = rows.map((r) => r.id);
  [order[at], order[to]] = [order[to]!, order[at]!];
  await prisma.$transaction(order.map((rowId, i) => prisma.publicProfile.updateMany({ where: { id: rowId, organisationId }, data: { sortOrder: (i + 1) * 10 } })));
  await writeAuditLog({ userId, action: 'organisation.people_reordered', entityType: 'PublicProfile', entityId: id, metadata: { direction } });
}
