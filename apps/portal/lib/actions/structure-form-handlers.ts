'use server';

import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { createDepartment, renameDepartment, setDepartmentActive, createBusinessUnit, renameBusinessUnit, createBranch } from './structure';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
/** Back to where the form was (structure page or a branch), with the outcome. */
function back(f: FormData, error: string, status: string) {
  const raw = s(f, 'returnTo');
  const to = /^\/(structure|branches\/[A-Za-z0-9_-]+)$/.test(raw) ? raw : '/structure';
  redirect(`${to}?${error ? `error=${encodeURIComponent(error)}` : `status=${status}`}`);
}

export async function createDepartmentFormAction(f: FormData) {
  let e = '';
  try { await createDepartment(s(f, 'branchId'), s(f, 'name')); } catch (err) { e = friendlyError(err, 'Could not add the department.', 'structure'); }
  back(f, e, 'department_added');
}
export async function renameDepartmentFormAction(f: FormData) {
  let e = '';
  try { await renameDepartment(s(f, 'departmentId'), s(f, 'name')); } catch (err) { e = friendlyError(err, 'Could not rename the department.', 'structure'); }
  back(f, e, 'department_renamed');
}
export async function setDepartmentActiveFormAction(f: FormData) {
  let e = '';
  const active = s(f, 'active') === 'true';
  try { await setDepartmentActive(s(f, 'departmentId'), active); } catch (err) { e = friendlyError(err, 'Could not change the department.', 'structure'); }
  back(f, e, active ? 'department_on' : 'department_off');
}
export async function createBusinessUnitFormAction(f: FormData) {
  let e = '';
  try { await createBusinessUnit(s(f, 'name')); } catch (err) { e = friendlyError(err, 'Could not add the business unit.', 'structure'); }
  back(f, e, 'unit_added');
}
export async function renameBusinessUnitFormAction(f: FormData) {
  let e = '';
  try { await renameBusinessUnit(s(f, 'businessUnitId'), s(f, 'name')); } catch (err) { e = friendlyError(err, 'Could not rename the business unit.', 'structure'); }
  back(f, e, 'unit_renamed');
}
export async function createBranchFormAction(f: FormData) {
  let e = '';
  let id = '';
  try {
    id = (await createBranch({ businessUnitId: s(f, 'businessUnitId'), name: s(f, 'name'), code: s(f, 'code') || undefined, city: s(f, 'city'), state: s(f, 'state'), standardDepartments: f.get('standardDepartments') === 'on' })).id;
  } catch (err) { e = friendlyError(err, 'Could not open the branch.', 'structure'); }
  if (e) back(f, e, '');
  redirect(`/branches/${id}?status=branch_opened`);
}
