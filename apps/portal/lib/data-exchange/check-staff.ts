/**
 * Data Exchange — checking one row of the staff file (P7). Pure, like
 * check.ts; the server part (staff-server.ts) finds the branch, the
 * department and the roles, and refuses an email or employee ID in use.
 */
import { cellText, type Checked, type Issue } from './check';
import type { Mapping } from './fields';

function get(cells: unknown[], mapping: Mapping, key: string): string {
  const i = mapping[key];
  return typeof i === 'number' ? cellText(cells[i]) : '';
}

/** Roles a file never gives: the organisation's administrators are added by hand (and the platform team never by an organisation). */
export const ROLES_NEVER_IMPORTED = ['administrator', 'branch-administrator'];

/** Colleagues a staff import brought in who have not been invited yet (switched off until then): the cut-over's open job
 * cards and services may still name them as technician or supervisor (P7, loaded first). */
export const STAFF_AWAITING_INVITATION = { importJobId: { not: null }, invitedAt: null } as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type StaffValues = {
  fullName: string;
  email: string;
  phone: string | null;
  employeeId: string | null;
  personnelNumber: string | null;
  branch: string;
  department: string | null;
  roles: string[];
};

/** "Technician; Front Desk", "Technician, Store officer" or one per line → the role names, each once. */
export function splitRoles(raw: string): string[] {
  const out: string[] = [];
  for (const r of String(raw ?? '').split(/[;\n,|]/).map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean)) if (!out.some((o) => o.toLowerCase() === r.toLowerCase())) out.push(r.slice(0, 80));
  return out.slice(0, 10);
}

export function checkStaffRow(cells: unknown[], mapping: Mapping): Checked<StaffValues> {
  const issues: Issue[] = [];
  const warn = (field: string, message: string) => issues.push({ field, message, level: 'warning' });
  const fail = (field: string, message: string) => issues.push({ field, message, level: 'error' });

  const fullName = get(cells, mapping, 'fullName').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!fullName) fail('fullName', 'Full name is required.');
  else if (fullName.length < 2) fail('fullName', 'The full name is too short.');
  const email = get(cells, mapping, 'email').trim().toLowerCase();
  if (!email) fail('email', 'Work email is required: the person signs in with it and their invitation goes to it.');
  else if (!EMAIL.test(email)) fail('email', `“${email}” is not an email address.`);
  else if (/^(info|admin|office|sales|service|workshop|accounts|hr|support|noreply|no-reply)@/.test(email)) warn('email', `${email} looks like a shared mailbox: each person signs in with their own address.`);
  const phone = get(cells, mapping, 'phone').slice(0, 40) || null;
  const employeeId = get(cells, mapping, 'employeeId').trim().toUpperCase().slice(0, 40) || null;
  if (employeeId && !/^[A-Z0-9][A-Z0-9\-_/.]*$/.test(employeeId)) fail('employeeId', `“${employeeId}” is not an employee ID (letters, digits and dashes).`);
  const personnelNumber = get(cells, mapping, 'personnelNumber').replace(/^0+(?=\d)/, '').slice(0, 40) || null;
  const branch = get(cells, mapping, 'branch').trim().slice(0, 80);
  if (!branch) fail('branch', 'Branch is required: the branch they work at (its name, code or SAP plant).');
  const department = get(cells, mapping, 'department').trim().slice(0, 80) || null;
  const roles = splitRoles(get(cells, mapping, 'roles'));
  for (const r of roles) if (ROLES_NEVER_IMPORTED.includes(r.toLowerCase().replace(/\s+/g, '-')) || /^(organisation |branch )?administrator$/i.test(r)) fail('roles', `“${r}”: the organisation’s administrators are added by hand on the Users page, never by a file.`);
  if (!roles.length && fullName && email) warn('roles', 'No role: the person will see only their own account until an administrator gives them a role.');

  const failed = issues.some((i) => i.level === 'error');
  return {
    status: failed ? 'REJECTED' : issues.length ? 'WARNING' : 'GOOD',
    issues,
    keys: [email ? `email:${email}` : '', employeeId ? `emp:${employeeId}` : ''].filter(Boolean),
    values: failed ? null : { fullName, email, phone, employeeId, personnelNumber, branch, department, roles },
  };
}
