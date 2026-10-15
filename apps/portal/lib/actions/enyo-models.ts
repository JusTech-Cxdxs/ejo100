'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@ejo/database';
import { friendlyError } from '@/lib/errors';
import { authorize, myOrganisationId, orgWhere, refuseDuringAssist } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { capabilityOf, readLevels, type Level } from '@/lib/enyo/ml/capabilities';
import { forgetModels } from '@/lib/enyo/ml/models';
import { requireUser } from './workshop';

/**
 * Enyo's trained models: choosing which model is used, retiring it, and the
 * automation level of each capability. Administrators with "Manage Enyo"
 * only, never during an assisted session, within their own organisation;
 * every change is in the audit trail. A model is never used until a person
 * chooses it here.
 */

class ModelError extends Error {}

const PAGE = '/enyo/models';

/** After authorize(): the person, never during an assisted session, and their organisation. */
async function manager() {
  const user = await requireUser();
  await refuseDuringAssist('enyo.models');
  return { userId: user.id };
}

/** Use this model for its task (the one in use before it is retired). Only a model that passed its checks. */
export async function chooseEnyoModel(modelId: string): Promise<void> {
  await authorize('enyo.manage', undefined, 'chooseEnyoModel', 'Only administrators manage Enyo.');
  const { userId } = await manager();
  if (typeof modelId !== 'string' || !modelId) throw new ModelError('Choose a model.');
  const m = await prisma.enyoModel.findFirst({ where: { id: modelId, ...(await orgWhere()) }, select: { id: true, organisationId: true, task: true, version: true, status: true } });
  if (!m) throw new ModelError('That model is not available.');
  if (m.status === 'REJECTED') throw new ModelError('This model did not pass its checks, so it cannot be used.');
  if (m.status === 'ACTIVE') return;
  const organisationId = m.organisationId;
  const now = new Date();
  const previous = await prisma.$transaction(async (tx) => {
    // One switch at a time per organisation and task, so two people choosing at once never leave two models in use.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`enyo-model:${organisationId}:${m.task}`}))`;
    const before = await tx.enyoModel.findMany({ where: { organisationId, task: m.task, status: 'ACTIVE' }, select: { id: true, version: true } });
    await tx.enyoModel.updateMany({ where: { organisationId, task: m.task, status: 'ACTIVE' }, data: { status: 'RETIRED', retiredAt: now } });
    // Compare-and-set: only if it is still a candidate (or retired) now.
    const res = await tx.enyoModel.updateMany({ where: { id: m.id, organisationId, status: { in: ['CANDIDATE', 'RETIRED'] } }, data: { status: 'ACTIVE', promotedAt: now, promotedById: userId, retiredAt: null } });
    if (res.count !== 1) throw new ModelError('This model changed meanwhile. Reload the page and try again.');
    return before;
  });
  forgetModels(organisationId);
  await writeAuditLog({ userId, action: 'enyo.model_promoted', entityType: 'EnyoModel', entityId: m.id, organisationId, metadata: { task: m.task, version: m.version, replaced: previous.map((p: { version: string }) => p.version) } });
}

/** Stop using a model (its capability then has no model until another is chosen). */
export async function retireEnyoModel(modelId: string): Promise<void> {
  await authorize('enyo.manage', undefined, 'retireEnyoModel', 'Only administrators manage Enyo.');
  const { userId } = await manager();
  const m = await prisma.enyoModel.findFirst({ where: { id: String(modelId ?? ''), ...(await orgWhere()) }, select: { id: true, organisationId: true, task: true, version: true, status: true } });
  if (!m) throw new ModelError('That model is not available.');
  const organisationId = m.organisationId;
  if (m.status !== 'ACTIVE') throw new ModelError('Only the model in use can be retired.');
  const res = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`enyo-model:${organisationId}:${m.task}`}))`;
    return tx.enyoModel.updateMany({ where: { id: m.id, status: 'ACTIVE' }, data: { status: 'RETIRED', retiredAt: new Date() } });
  });
  if (res.count !== 1) throw new ModelError('This model changed meanwhile. Reload the page and try again.');
  forgetModels(organisationId);
  await writeAuditLog({ userId, action: 'enyo.model_retired', entityType: 'EnyoModel', entityId: m.id, organisationId, metadata: { task: m.task, version: m.version } });
}

/** The automation level of one capability (within the levels it allows). */
export async function setCapabilityLevel(key: string, level: string): Promise<void> {
  await authorize('enyo.manage', undefined, 'setCapabilityLevel', 'Only administrators manage Enyo.');
  const { userId } = await manager();
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new ModelError('This account is not placed in an organisation yet.');
  const cap = capabilityOf(key);
  if (!cap) throw new ModelError('Unknown capability.');
  if (!(cap.levels as readonly string[]).includes(level)) throw new ModelError(`${cap.label} can be set to ${cap.levels.join(', ').toLowerCase()}.`);
  // Read and write under one lock, so two administrators changing different capabilities at once both count.
  const before = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`enyo-levels:${organisationId}`}))`;
    const row = await tx.enyoSetting.findUnique({ where: { organisationId }, select: { capabilityLevels: true } });
    const current = readLevels(row?.capabilityLevels ?? null);
    if (current[cap.key] === level) return null;
    const next = { ...current, [cap.key]: level as Level };
    await tx.enyoSetting.upsert({ where: { organisationId }, create: { organisationId, capabilityLevels: next, updatedById: userId }, update: { capabilityLevels: next, updatedById: userId } });
    return current;
  });
  if (!before) return;
  await writeAuditLog({ userId, action: 'enyo.capability_level_changed', entityType: 'EnyoSetting', entityId: organisationId, organisationId, metadata: { capability: cap.key, from: before[cap.key], to: level } });
}

// ------------------------------------------------------------------ form handlers

function fail(err: unknown, fallback: string): never {
  redirect(`${PAGE}?error=${encodeURIComponent(friendlyError(err instanceof ModelError ? new Error(err.message) : err, fallback, 'enyo-models'))}`);
}

export async function chooseEnyoModelFormAction(f: FormData) {
  try {
    await chooseEnyoModel(String(f.get('modelId') ?? ''));
  } catch (err) {
    fail(err, 'The model could not be switched on.');
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?status=model_in_use`);
}

export async function retireEnyoModelFormAction(f: FormData) {
  try {
    await retireEnyoModel(String(f.get('modelId') ?? ''));
  } catch (err) {
    fail(err, 'The model could not be retired.');
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?status=model_retired`);
}

export async function setCapabilityLevelFormAction(f: FormData) {
  try {
    await setCapabilityLevel(String(f.get('capability') ?? ''), String(f.get('level') ?? ''));
  } catch (err) {
    fail(err, 'The level could not be changed.');
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?status=level_saved`);
}
