'use client';

import { useActionState, useMemo, useState } from 'react';
import { addStaffMemberAction, type AddStaffState } from '@/lib/actions/users-admin-form-handlers';
import { FilterSelect, type FilterOption } from '@/components/FilterSelect';
import { SubmitButton } from '@/components/SubmitButton';
import { Icon, type IconName } from '@/components/ui';

const field = 'min-h-11 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const labelCls = 'mb-1.5 block text-sm font-medium text-[var(--ejo-text)]';
const hintCls = 'mt-1.5 text-xs text-[var(--ejo-text-muted)]';
const req = <span className="text-[var(--ejo-error)]" aria-hidden="true"> *</span>;

export type DepartmentOption = FilterOption & { branchId: string };
export type RoleOption = FilterOption & { description?: string };

function Step({ n, icon, title, hint, children }: { n: number; icon: IconName; title: string; hint: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
      <legend className="sr-only">{title}</legend>
      <div className="flex items-start gap-3 border-b border-[var(--ejo-border)] px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]" aria-hidden="true"><Icon name={icon} size={18} /></span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Step {n}</p>
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">{title}</h2>
          <p className="text-xs text-[var(--ejo-text-muted)]">{hint}</p>
        </div>
      </div>
      <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/**
 * Add a staff member, in three steps: who they are, where they work, what
 * they may do. Every choice is picked from a list (typed to search, never
 * pre-filled); the department list follows the branch; the role shows what it
 * allows before you give it. If something is wrong, what was typed stays and
 * the reason shows above the button.
 */
export function AddStaffForm({ branches, departments, roles, branchLocked, lockedBranchName }: { branches: FilterOption[]; departments: DepartmentOption[]; roles: RoleOption[]; branchLocked: string | null; lockedBranchName?: string }) {
  const [state, action] = useActionState<AddStaffState, FormData>(addStaffMemberAction, { error: null, values: {} });
  const [branchId, setBranchId] = useState<string>(branchLocked ?? state.values.branchId ?? '');
  const [roleId, setRoleId] = useState<string>(state.values.roleId ?? '');
  const deptOptions = useMemo(() => departments.filter((d) => d.branchId === branchId).map(({ value, label }) => ({ value, label })), [departments, branchId]);
  const role = roles.find((r) => r.value === roleId);

  return (
    <form action={action} autoComplete="off" className="space-y-5">
      <Step n={1} icon="user" title="Who they are" hint="Their name as it should appear on records, and the work email they sign in with.">
        <div><label className={labelCls} htmlFor="fullName">Full name{req}</label><input id="fullName" name="fullName" required minLength={2} maxLength={120} autoComplete="off" placeholder="First and last name" defaultValue={state.values.fullName ?? ''} key={`n-${state.values.fullName ?? ''}`} className={field} /></div>
        <div><label className={labelCls} htmlFor="email">Work email{req}</label><input id="email" name="email" type="email" required maxLength={200} autoComplete="off" placeholder="name@company.com" defaultValue={state.values.email ?? ''} key={`e-${state.values.email ?? ''}`} className={field} /><p className={hintCls}>The welcome email and every access change go here.</p></div>
        <div><label className={labelCls} htmlFor="phone">Phone</label><input id="phone" name="phone" type="tel" maxLength={40} autoComplete="off" placeholder="Optional" defaultValue={state.values.phone ?? ''} key={`p-${state.values.phone ?? ''}`} className={field} /></div>
      </Step>

      <Step n={2} icon="branch" title="Where they work" hint="The branch decides which records they see; the department decides whose exit passes their head authorises.">
        <div>
          <span className={labelCls}>Branch{req}</span>
          {branchLocked ? (
            <><input type="hidden" name="branchId" value={branchLocked} /><p className={`${field} flex items-center bg-[var(--ejo-bg)]`}>{lockedBranchName ?? 'Your branch'}</p><p className={hintCls}>You add people to your own branch.</p></>
          ) : (
            <FilterSelect key={`b-${state.values.branchId ?? ''}`} name="branchId" required ariaLabel="Branch" placeholder="Type to find a branch…" className="w-full" large options={branches} defaultValue={state.values.branchId} onChange={setBranchId} />
          )}
        </div>
        <div>
          <span className={labelCls}>Department</span>
          <FilterSelect key={`d-${branchId}-${state.values.departmentId ?? ''}`} name="departmentId" ariaLabel="Department" placeholder={branchId ? (deptOptions.length ? 'Type to find a department…' : 'This branch has no departments yet') : 'Choose the branch first'} className="w-full" large options={deptOptions} defaultValue={deptOptions.some((d) => d.value === state.values.departmentId) ? state.values.departmentId : undefined} />
          <p className={hintCls}>Only the departments of the chosen branch.</p>
        </div>
      </Step>

      <Step n={3} icon="key" title="What they may do" hint="Start with one role; give more later from their card. Everyone can request their own exit passes.">
        <div>
          <span className={labelCls}>First role</span>
          <FilterSelect key={`r-${state.values.roleId ?? ''}`} name="roleId" ariaLabel="First role" placeholder="Type to find a role…" className="w-full" large options={roles.map(({ value, label }) => ({ value, label }))} defaultValue={state.values.roleId} onChange={setRoleId} />
        </div>
        <div className="rounded-[var(--ejo-radius-md)] border border-dashed border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3 text-sm" aria-live="polite">
          {role ? (
            <><p className="font-medium text-[var(--ejo-text)]">{role.label}</p><p className="mt-1 text-xs leading-relaxed text-[var(--ejo-text-muted)]">{role.description ?? 'A role your organisation set up. Its permissions are on the Roles page.'}</p></>
          ) : <p className="text-xs text-[var(--ejo-text-muted)]">Choose a role to see what it allows. Without one, they can only request their own exit passes.</p>}
        </div>
      </Step>

      {state.error ? (
        <p role="alert" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/[0.07] px-4 py-3 text-sm text-[var(--ejo-text)]"><span className="font-semibold text-[var(--ejo-error)]">Not added: </span>{state.error}</p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-xs text-[var(--ejo-text-muted)]"><Icon name="lock" size={14} />No password is ever emailed or seen by you — they set their own from the link.</p>
        <div className="flex flex-wrap gap-2">
          <a href="/users" className="inline-flex min-h-11 items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">Cancel</a>
          <SubmitButton label="Add and send the welcome email" pendingLabel="Adding…" className="min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-5 text-sm font-semibold text-white" />
        </div>
      </div>
    </form>
  );
}
