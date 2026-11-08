'use server';

/**
 * The cut-over checklist (P9), per branch: what each step needs, where it
 * stands (from the imports themselves), "not needed" with a reason, and the
 * branch's sign-off as cut over (with the checklist as it stood), reopened
 * with a reason. Reading needs either Data Exchange right; marking and
 * signing off need the right to approve imports at that branch. Every mark
 * is an audit entry (entityType BranchCutover): append-only, the latest
 * counts, nothing is ever edited. Fenced to the person's own organisation;
 * refused during an assisted session.
 */
import { prisma } from '@ejo/database';
import { allows, authorize, getPrincipal, myOrganisationId, refuseDuringAssist } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { requireUser } from '@/lib/actions/workshop';
import { ENTITIES, isEntityKey } from '@/lib/data-exchange/fields';
import { BRANCH_TYPE_WORDS, isBranchType, type BranchType } from '@/lib/branch-types';
import { cleanCutoverReason, cutoverSnapshot, cutoverStepsFor, cutoverView, organisationWide, CUTOVER_PLAN, type CutoverMark, type CutoverView } from '@/lib/data-exchange/cutover';

type Done = { ok: true } | { ok: false; error: string };
const fail = (error: string): Done => ({ ok: false, error });
const ENTITY_TYPE = 'BranchCutover';
const ACTIONS = { not_needed: 'data_exchange.cutover_step_not_needed', needed: 'data_exchange.cutover_step_needed', signed_off: 'data_exchange.cutover_signed_off', reopened: 'data_exchange.cutover_reopened' } as const;
const KIND_OF: Record<string, CutoverMark['action']> = Object.fromEntries(Object.entries(ACTIONS).map(([k, v]) => [v, k as CutoverMark['action']]));

async function viewer(where: string) {
  const p = await getPrincipal();
  const may = (await allows('dataexchange.import.run')) || (await allows('dataexchange.import.approve'));
  if (!may) await authorize('dataexchange.import.approve', undefined, where, 'The cut-over checklist is for the people who bring records in and approve them.');
  const organisationId = p.organisationId ?? (await myOrganisationId());
  if (!organisationId) throw new Error('Your account is not placed in an organisation yet.');
  return { p, organisationId };
}

async function branchOf(organisationId: string, branchId: string) {
  if (typeof branchId !== 'string' || !branchId) return null;
  const b = await prisma.branch.findFirst({ where: { id: branchId.slice(0, 40), businessUnit: { organisationId } }, select: { id: true, name: true, type: true, isActive: true } });
  return b && CUTOVER_PLAN[b.type as keyof typeof CUTOVER_PLAN] ? b : null;
}

async function marksOf(organisationId: string, branchId: string): Promise<CutoverMark[]> {
  const rows = await prisma.auditLog.findMany({ where: { organisationId, entityType: ENTITY_TYPE, entityId: branchId, action: { in: Object.values(ACTIONS) } }, orderBy: { createdAt: 'asc' }, take: 2000, select: { action: true, metadata: true, createdAt: true, userId: true } });
  const ids = [...new Set(rows.map((r) => r.userId).filter((x): x is string => Boolean(x)))];
  const names = new Map((ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : []).map((u) => [u.id, u.fullName]));
  return rows.map((r) => {
    const m = (r.metadata ?? {}) as { entity?: string; reason?: string };
    return { action: KIND_OF[r.action]!, entity: m.entity, reason: m.reason, at: r.createdAt, by: (r.userId && names.get(r.userId)) || 'Someone' };
  });
}

async function viewOf(organisationId: string, branch: { id: string; type: string }): Promise<CutoverView> {
  const steps = cutoverStepsFor(branch.type);
  const orgWide = steps.filter((s) => organisationWide(s.entity)).map((s) => s.entity);
  const mine = steps.filter((s) => !organisationWide(s.entity)).map((s) => s.entity);
  const [jobs, marks] = await Promise.all([
    prisma.importJob.findMany({
      where: { organisationId, OR: [{ entity: { in: orgWide } }, { entity: { in: mine }, branchId: branch.id }] },
      select: { id: true, number: true, entity: true, branchId: true, status: true, createdRows: true, updatedRows: true, completedAt: true, signedOffAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: 1000,
    }),
    marksOf(organisationId, branch.id),
  ]);
  return cutoverView(steps, jobs, marks);
}

export type CutoverBranchRow = { id: string; name: string; type: string; typeWords: string; settled: number; total: number; signedOff: { at: Date; by: string } | null };

/** Every branch with a checklist (workshops, warehouses, assembly plants), with how far each has come. */
export async function listCutoverBranches(): Promise<CutoverBranchRow[]> {
  const { organisationId } = await viewer('listCutoverBranches');
  const branches = await prisma.branch.findMany({ where: { businessUnit: { organisationId }, isActive: true, type: { in: Object.keys(CUTOVER_PLAN) as BranchType[] } }, orderBy: { name: 'asc' }, select: { id: true, name: true, type: true } });
  const out: CutoverBranchRow[] = [];
  for (const b of branches) {
    const v = await viewOf(organisationId, b);
    out.push({ id: b.id, name: b.name, type: b.type, typeWords: isBranchType(b.type) ? BRANCH_TYPE_WORDS[b.type] : b.type, settled: v.settled, total: v.total, signedOff: v.signedOff });
  }
  return out;
}

export type CutoverPage = { branch: { id: string; name: string; type: string; typeWords: string }; view: CutoverView; may: { mark: boolean; signOff: boolean; run: boolean }; history: CutoverMark[] };

/** One branch's checklist, or null when it is not this organisation's (or has none). */
export async function getCutover(branchId: string): Promise<CutoverPage | null> {
  const { organisationId } = await viewer('getCutover');
  const b = await branchOf(organisationId, branchId);
  if (!b) return null;
  const [view, history, approve, run] = await Promise.all([viewOf(organisationId, b), marksOf(organisationId, b.id), allows('dataexchange.import.approve', { branchId: b.id }), allows('dataexchange.import.run', { branchId: b.id })]);
  return { branch: { id: b.id, name: b.name, type: b.type, typeWords: isBranchType(b.type) ? BRANCH_TYPE_WORDS[b.type] : b.type }, view, may: { mark: approve, signOff: approve, run }, history: history.reverse().slice(0, 50) };
}

/** Writes the mark and reads it back: a mark is only made once it is in the audit trail. */
async function record(organisationId: string, branchId: string, action: string, metadata: Record<string, unknown>): Promise<boolean> {
  const me = await requireUser();
  const where = { organisationId, entityType: ENTITY_TYPE, entityId: branchId, action, userId: me.id };
  const before = await prisma.auditLog.count({ where });
  await writeAuditLog({ userId: me.id, organisationId, action, entityType: ENTITY_TYPE, entityId: branchId, metadata });
  return (await prisma.auditLog.count({ where })) > before;
}

async function actor(branchId: string, where: string) {
  try { await refuseDuringAssist(where); } catch (e) { return { error: (e as Error).message } as const; }
  const { organisationId } = await viewer(where);
  const b = await branchOf(organisationId, branchId);
  if (!b) return { error: 'This branch was not found.' } as const;
  if (!(await allows('dataexchange.import.approve', { branchId: b.id }))) {
    await authorize('dataexchange.import.approve', { branchId: b.id }, where, 'Only someone who approves imports at this branch can change its cut-over checklist.').catch(() => undefined);
    return { error: 'Only someone who approves imports at this branch can change its cut-over checklist.' } as const;
  }
  return { organisationId, b } as const;
}

/** Marks a step "not needed" for this branch (a reason is required), or needed again. Never a step already loaded. */
export async function markCutoverStep(branchId: string, entity: string, notNeeded: boolean, reason?: string): Promise<Done> {
  const a = await actor(branchId, 'markCutoverStep');
  if ('error' in a) return fail(a.error!);
  if (!isEntityKey(entity) || !cutoverStepsFor(a.b.type).some((s) => s.entity === entity)) return fail('That is not a step of this branch’s cut-over.');
  const view = await viewOf(a.organisationId, a.b);
  const step = view.steps.find((s) => s.entity === entity)!;
  if (view.signedOff) return fail('This branch is signed off as cut over. Reopen it first, with a reason.');
  if (notNeeded) {
    if (step.state === 'DONE' || step.state === 'AWAITING_FINANCE') return fail(`${ENTITIES[entity].label} is already loaded here, so it is needed.`);
    if (step.state === 'AWAITING_APPROVAL' || step.state === 'IN_PROGRESS') return fail(`An import of ${ENTITIES[entity].plural} is under way: finish or cancel it first.`);
    const why = cleanCutoverReason(reason);
    if (!why) return fail('Say why this branch has none (a few words), e.g. “No open warranty claims on the day”.');
    if (!(await record(a.organisationId, a.b.id, ACTIONS.not_needed, { branch: a.b.name, entity, reason: why }))) return fail('It could not be recorded. Try again.');
    return { ok: true };
  }
  if (step.state !== 'NOT_NEEDED') return fail('This step is not marked as not needed.');
  if (!(await record(a.organisationId, a.b.id, ACTIONS.needed, { branch: a.b.name, entity }))) return fail('It could not be recorded. Try again.');
  return { ok: true };
}

/** Signs the branch off as cut over: every step loaded (and confirmed by Finance) or not needed. The checklist as it stood is recorded with it. */
export async function signOffCutover(branchId: string): Promise<Done> {
  const a = await actor(branchId, 'signOffCutover');
  if ('error' in a) return fail(a.error!);
  const view = await viewOf(a.organisationId, a.b);
  if (view.signedOff) return fail('This branch is already signed off as cut over.');
  if (view.blockers.length) return fail(`Not yet: ${view.blockers.join(' ')}`);
  if (!(await record(a.organisationId, a.b.id, ACTIONS.signed_off, { branch: a.b.name, steps: cutoverSnapshot(view) }))) return fail('It could not be recorded. Try again.');
  return { ok: true };
}

/** Reopens a signed-off branch (a reason is required): for a file that has to be loaded again. */
export async function reopenCutover(branchId: string, reason: string): Promise<Done> {
  const a = await actor(branchId, 'reopenCutover');
  if ('error' in a) return fail(a.error!);
  const view = await viewOf(a.organisationId, a.b);
  if (!view.signedOff) return fail('This branch is not signed off.');
  const why = cleanCutoverReason(reason);
  if (!why) return fail('Say why it is reopened (a few words).');
  if (!(await record(a.organisationId, a.b.id, ACTIONS.reopened, { branch: a.b.name, reason: why }))) return fail('It could not be recorded. Try again.');
  return { ok: true };
}
