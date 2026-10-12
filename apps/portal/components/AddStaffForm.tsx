'use client';

import { useActionState } from 'react';
import { addStaffMemberAction, type AddStaffState } from '@/lib/actions/users-admin-form-handlers';
import { FilterSelect, type FilterOption } from '@/components/FilterSelect';
import { SubmitButton } from '@/components/SubmitButton';

const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const labelCls = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';

/** Add a staff member. Starts empty; if something is wrong, what was typed stays and the reason shows above the button. */
export function AddStaffForm({ branches, departments, roles, branchLocked, lockedBranchName }: { branches: FilterOption[]; departments: FilterOption[]; roles: FilterOption[]; branchLocked: string | null; lockedBranchName?: string }) {
  const [state, action] = useActionState<AddStaffState, FormData>(addStaffMemberAction, { error: null, values: {} });
  return (
    <form action={action} autoComplete="off" className="grid gap-4 border-t border-[var(--ejo-border)] px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
      <div><label className={labelCls} htmlFor="fullName">Full name <span className="text-[var(--ejo-error)]">*</span></label><input id="fullName" name="fullName" required minLength={2} maxLength={120} autoComplete="off" placeholder="First and last name" defaultValue={state.values.fullName ?? ''} key={`n-${state.values.fullName ?? ''}`} className={field} /></div>
      <div><label className={labelCls} htmlFor="email">Work email <span className="text-[var(--ejo-error)]">*</span></label><input id="email" name="email" type="email" required maxLength={200} autoComplete="off" placeholder="name@company.com" defaultValue={state.values.email ?? ''} key={`e-${state.values.email ?? ''}`} className={field} /></div>
      <div><label className={labelCls} htmlFor="phone">Phone</label><input id="phone" name="phone" type="tel" maxLength={40} autoComplete="off" placeholder="Optional" defaultValue={state.values.phone ?? ''} key={`p-${state.values.phone ?? ''}`} className={field} /></div>
      <div><label className={labelCls}>Branch <span className="text-[var(--ejo-error)]">*</span></label>
        {branchLocked ? (
          <><input type="hidden" name="branchId" value={branchLocked} /><p className={`${field} bg-[var(--ejo-surface)]`}>{lockedBranchName ?? 'Your branch'}</p></>
        ) : (
          <FilterSelect key={`b-${state.values.branchId ?? ""}`} name="branchId" required ariaLabel="Branch" placeholder="Type to find a branch…" className="w-full" large options={branches} defaultValue={state.values.branchId} />
        )}
      </div>
      <div><label className={labelCls}>Department</label><FilterSelect key={`d-${state.values.departmentId ?? ""}`} name="departmentId" ariaLabel="Department" placeholder="Type to find a department…" className="w-full" large options={departments} defaultValue={state.values.departmentId} /></div>
      <div><label className={labelCls}>First role</label><FilterSelect key={`r-${state.values.roleId ?? ""}`} name="roleId" ariaLabel="First role" placeholder="Type to find a role…" className="w-full" large options={roles} defaultValue={state.values.roleId} /></div>
      {state.error ? (
        <p role="alert" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/[0.07] px-3 py-2 text-sm text-[var(--ejo-text)] sm:col-span-2 lg:col-span-3"><span className="font-semibold text-[var(--ejo-error)]">Not added: </span>{state.error}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 lg:col-span-3">
        <p className="text-xs text-[var(--ejo-text-muted)]">No password is ever emailed or seen by you — they set their own from the link.</p>
        <SubmitButton label="Add and send the welcome email" pendingLabel="Adding…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-semibold text-white" />
      </div>
    </form>
  );
}
