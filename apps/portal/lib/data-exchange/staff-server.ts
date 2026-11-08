/**
 * Data Exchange — the organisation's people (P7). Server only (never a
 * 'use server' file): lib/actions/data-exchange.ts checks who is asking,
 * locks the import and calls these inside its transactions.
 *
 * Each row becomes an EJO account in its branch and department, with its
 * roles — switched OFF, with an unusable password, and nobody is emailed.
 * An administrator then sends the invitations (sendStaffInvitations in
 * lib/actions/data-exchange.ts): that switches each account on and emails
 * the person their welcome with a one-time link to set their own password,
 * the same email as a person added on the Users page. The organisation's
 * administrators are never brought in by a file. Undo moves the accounts
 * nobody has invited, used or worked with to the Recycle bin.
 */
import { prisma, type Prisma } from '@ejo/database';
import { hashPassword } from 'better-auth/crypto';
import { randomBytes } from 'node:crypto';
import { checkStaffRow, ROLES_NEVER_IMPORTED, type StaffValues } from './check-staff';
import type { Issue } from './check';
import type { Mapping } from './fields';
import { newId, writeLoadResults, type LoadRow, type Result, type RowUpdate } from './rows-server';
import { formatEmployeeId } from '../employee-id';
import { nextEmployeeId } from '../staff-onboarding';
import { writeAuditLog } from '../workshop-core';
import { ROLE_LABELS } from '../authz/catalogue';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
export type StaffJob = { id: string; number: string; organisationId: string; sourceSystem: string; createdById: string; approvedById: string | null };

const src = (s: string) => (s === 'LEGACY' ? 'LEGACY' : 'SAP');
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');

type Branch = { id: string; name: string; code: string | null; sapPlant: string | null };
type Lookups = {
  byEmail: Map<string, { id: string; organisationId: string | null; fullName: string; employeeId: string | null }>;
  byEmployeeId: Map<string, { id: string; email: string }>;
  branches: Branch[];
  departments: { id: string; name: string; slug: string; branchId: string }[];
  roles: { id: string; name: string; slug: string }[];
};

async function lookups(db: Db, job: StaffJob, vals: StaffValues[]): Promise<Lookups> {
  const emails = [...new Set(vals.map((v) => v.email))];
  const ids = [...new Set(vals.map((v) => v.employeeId).filter((v): v is string => Boolean(v)))];
  const [byEmail, byEmployeeId, branches, roles] = await Promise.all([
    emails.length ? db.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true, organisationId: true, fullName: true, employeeId: true } }) : [],
    ids.length ? db.user.findMany({ where: { employeeId: { in: ids } }, select: { id: true, email: true, employeeId: true } }) : [],
    db.branch.findMany({ where: { businessUnit: { organisationId: job.organisationId } }, select: { id: true, name: true, code: true, sapPlant: true } }),
    db.role.findMany({ where: { organisationId: job.organisationId, isSuperAdmin: false }, select: { id: true, name: true, slug: true } }),
  ]);
  const departments = branches.length ? await db.department.findMany({ where: { branchId: { in: branches.map((b) => b.id) }, isActive: true }, select: { id: true, name: true, slug: true, branchId: true } }) : [];
  return {
    byEmail: new Map(byEmail.map((u) => [u.email, { id: u.id, organisationId: u.organisationId, fullName: u.fullName, employeeId: u.employeeId }])),
    byEmployeeId: new Map(byEmployeeId.map((u) => [String(u.employeeId).toUpperCase(), { id: u.id, email: u.email }])),
    branches, departments, roles,
  };
}

/** The branch a row names: its name (or part of it), its code, or its SAP plant. */
export function pickBranch(raw: string, branches: Branch[]): Branch | null {
  const k = norm(raw);
  const plant = raw.trim().replace(/^0+/, '');
  return branches.find((b) => norm(b.name) === k) ?? branches.find((b) => b.code && norm(b.code) === k) ?? branches.find((b) => b.sapPlant && b.sapPlant.replace(/^0+/, '') === plant)
    ?? (k.length >= 4 ? branches.filter((b) => norm(b.name).includes(k)).sort((a, b) => a.name.length - b.name.length)[0] ?? null : null);
}

type Resolved = { branch: Branch | null; departmentId: string | null; roles: { id: string; name: string; slug: string }[]; errors: string[]; notes: string[] };

function resolve(v: StaffValues, L: Lookups): Resolved {
  const errors: string[] = [];
  const notes: string[] = [];
  const branch = pickBranch(v.branch, L.branches);
  if (!branch) errors.push(`There is no branch “${v.branch}” in this organisation. Use the branch’s name, code or SAP plant as on the Structure page.`);
  let departmentId: string | null = null;
  if (branch && v.department) {
    const k = norm(v.department);
    const d = L.departments.find((x) => x.branchId === branch.id && (norm(x.name) === k || norm(x.slug) === k));
    if (d) departmentId = d.id;
    else errors.push(`${branch.name} has no department “${v.department}”. Use a department of that branch as on the Structure page, or leave it empty.`);
  }
  const roles: Resolved['roles'] = [];
  for (const r of v.roles) {
    const k = norm(r);
    // By its name, its slug, or the name EJO shows it under ("Front Desk" for receptionist, "Manager" for workshop-manager).
    const role = L.roles.find((x) => norm(x.name) === k || norm(x.slug) === k) ?? L.roles.find((x) => ROLE_LABELS[x.slug] && (norm(ROLE_LABELS[x.slug]!) === k || norm(ROLE_LABELS[x.slug]!.replace(/\s*\(.*\)\s*$/, '')) === k));
    if (!role) errors.push(`There is no role “${r}” in this organisation. Use the role’s name as on the Roles page.`);
    else if (ROLES_NEVER_IMPORTED.includes(role.slug)) errors.push(`“${role.name}”: the organisation’s administrators are added by hand on the Users page, never by a file.`);
    else if (!roles.some((x) => x.id === role.id)) roles.push(role);
  }
  if (v.employeeId) {
    const taken = L.byEmployeeId.get(v.employeeId);
    if (taken && taken.email !== v.email) errors.push(`Employee ID ${v.employeeId} is already someone else’s (${taken.email}). Leave it empty and EJO issues one, or correct it.`);
  }
  return { branch, departmentId, roles, errors, notes };
}

// ── Check ─────────────────────────────────────────────────────────────

export async function checkStaffRows(job: StaffJob, mapping: Mapping, rows: { id: string; cells: Prisma.JsonValue }[]): Promise<RowUpdate[]> {
  const checked = rows.map((r) => ({ r, c: checkStaffRow(r.cells as unknown[], mapping) }));
  const L = await lookups(prisma, job, checked.map((x) => x.c.values).filter((v): v is StaffValues => Boolean(v)));
  const out: RowUpdate[] = [];
  for (const { r, c } of checked) {
    const issues: Issue[] = [...c.issues];
    let status: string = c.status;
    let matchedId: string | null = null;
    let matchedBy: string | null = null;
    const v = c.values;
    if (v && status !== 'REJECTED') {
      const hit = L.byEmail.get(v.email);
      if (hit && hit.organisationId !== job.organisationId) {
        issues.push({ field: 'email', level: 'error', message: `${v.email} already has an EJO account elsewhere: each address belongs to one person. Use the person’s own work address.` });
        status = 'REJECTED';
      } else if (hit) {
        matchedId = hit.id; matchedBy = 'email'; status = 'WARNING';
        issues.push({ field: 'email', level: 'warning', message: `Already in EJO (${hit.fullName}${hit.employeeId ? `, ${hit.employeeId}` : ''}); left as they are — change their roles on the Users page.` });
      } else {
        const res = resolve(v, L);
        for (const e of res.errors) issues.push({ field: 'staff', level: 'error', message: e });
        for (const n of res.notes) issues.push({ field: 'staff', level: 'warning', message: n });
        if (res.errors.length) status = 'REJECTED';
        else if (status === 'GOOD' && issues.length) status = 'WARNING';
      }
    }
    out.push({ id: r.id, status, issues, matchedId, matchedBy, keys: c.keys });
  }
  return out;
}

/** What will load: people, by branch (the first few), and how many get no role yet. */
export async function staffTotalsOfRows(jobId: string, mapping: Mapping, statuses: string[]): Promise<{ lines: number; quantity: number; value: number; noRole: number; branches: number }> {
  let after = 0; let lines = 0; let noRole = 0; const branches = new Set<string>();
  for (;;) {
    const rows = await prisma.importRow.findMany({ where: { jobId, status: { in: statuses }, matchedBy: null, rowNumber: { gt: after } }, orderBy: { rowNumber: 'asc' }, take: 5000, select: { rowNumber: true, cells: true } });
    for (const r of rows) {
      const v = checkStaffRow(r.cells as unknown[], mapping).values;
      if (!v) continue;
      lines += 1; branches.add(norm(v.branch));
      if (!v.roles.length) noRole += 1;
    }
    if (rows.length < 5000) break;
    after = rows[rows.length - 1]!.rowNumber;
  }
  return { lines, quantity: 0, value: 0, noRole, branches: branches.size };
}

export async function staffTotalsLoaded(jobId: string): Promise<{ lines: number; quantity: number; value: number }> {
  const [lines, invited] = await Promise.all([prisma.user.count({ where: { importJobId: jobId } }), prisma.user.count({ where: { importJobId: jobId, invitedAt: { not: null } } })]);
  return { lines, quantity: invited, value: 0 };
}

// ── Load ──────────────────────────────────────────────────────────────

export async function loadStaffRows(tx: Tx, job: StaffJob, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  const checked = rows.map((r) => ({ r, c: checkStaffRow(r.cells as unknown[], mapping) }));
  const L = await lookups(tx, job, checked.map((x) => x.c.values).filter((v): v is StaffValues => Boolean(v)));
  const results: Result[] = [];
  const todo: { r: LoadRow; v: StaffValues; res: Resolved }[] = [];
  const seen = new Set<string>();
  for (const { r, c } of checked) {
    const v = c.values;
    if (!v) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Could not be read again when loading.' }); continue; }
    const hit = L.byEmail.get(v.email);
    if (hit) { results.push({ id: r.id, status: 'SKIPPED', resultId: hit.organisationId === job.organisationId ? hit.id : null, note: hit.organisationId === job.organisationId ? `Already in EJO (${hit.fullName}); left as they are.` : 'This address has an account elsewhere; not loaded.' }); continue; }
    const res = resolve(v, L);
    if (res.errors.length || !res.branch) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: res.errors[0] ?? 'The branch is no longer there; not loaded.' }); continue; }
    if (seen.has(v.email) || (v.employeeId && seen.has(`emp:${v.employeeId}`))) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Another row of this file already brought this person in.' }); continue; }
    seen.add(v.email); if (v.employeeId) seen.add(`emp:${v.employeeId}`);
    todo.push({ r, v, res });
  }
  // Employee IDs for those without one: the branch's next numbers, counted on within this batch.
  const nextOf = new Map<string, { prefix: string; n: number }>();
  const issue = async (branchId: string): Promise<string> => {
    let cur = nextOf.get(branchId);
    if (!cur) {
      const first = await nextEmployeeId(branchId);
      const at = first.lastIndexOf('-');
      cur = { prefix: first.slice(0, at), n: Number(first.slice(at + 1)) - 1 };
    }
    let id: string;
    do { cur.n += 1; id = formatEmployeeId(cur.prefix, cur.n); } while (L.byEmployeeId.has(id) || seen.has(`emp:${id}`));
    nextOf.set(branchId, cur);
    seen.add(`emp:${id}`);
    return id;
  };
  const range = src(job.sourceSystem);
  const actor = job.approvedById ?? job.createdById;
  for (const { r, v, res } of todo) {
    const id = newId();
    const employeeId = v.employeeId ?? (await issue(res.branch!.id));
    // Unusable until the person sets their own password from the invitation; switched off until it is sent.
    const unusable = await hashPassword(randomBytes(32).toString('hex'));
    await tx.user.create({
      data: {
        id, fullName: v.fullName, email: v.email, employeeId, phone: v.phone, organisationId: job.organisationId, branchId: res.branch!.id, departmentId: res.departmentId,
        isActive: false, accountType: 'EMPLOYEE', externalSource: v.personnelNumber ? range : null, externalId: v.personnelNumber, importJobId: job.id,
        accounts: { create: { accountId: id, providerId: 'credential', password: unusable } },
        roles: { create: res.roles.map((role) => ({ roleId: role.id })) },
      },
    });
    await writeAuditLog({ userId: actor, action: 'user.created', entityType: 'User', entityId: id, organisationId: job.organisationId, metadata: { person: v.fullName, email: v.email, employeeId, branchId: res.branch!.id, roles: res.roles.map((x) => x.name), import: job.number, switchedOffUntilInvited: true } });
    results.push({ id: r.id, status: 'CREATED', resultId: id, note: res.notes.length ? res.notes.join(' ') : undefined });
  }
  await writeLoadResults(tx, rows, results);
}

// ── Undo ──────────────────────────────────────────────────────────────

/** An imported account nobody has used: never invited, never signed in, no work on any record, still as the import made it. */
export async function staffUntouchedSinceImport(db: Db, id: string, jobId: string): Promise<boolean> {
  const u = await db.user.findFirst({ where: { id, importJobId: jobId }, select: { invitedAt: true, lastLoginAt: true, isActive: true, _count: { select: { sessions: true } } } });
  if (!u || u.invitedAt || u.lastLoginAt || u.isActive || u._count.sessions) return false;
  // Any audit entry BY this person, or about them after the import (a role given, a branch changed), means they are in use.
  const [by, about] = await Promise.all([
    db.auditLog.count({ where: { userId: id } }),
    db.auditLog.count({ where: { entityType: 'User', entityId: id, NOT: { action: 'user.created' } } }),
  ]);
  return by === 0 && about === 0;
}
