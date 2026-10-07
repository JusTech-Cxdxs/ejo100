import { listUsersForAdmin, staffPlacementOptions } from '@/lib/actions/users-admin';
import { assignRoleFormAction, removeRoleFormAction, createStaffMemberFormAction, setStaffActiveFormAction } from '@/lib/actions/users-admin-form-handlers';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { SubmitButton } from '@/components/SubmitButton';
import { FilterSelect } from '@/components/FilterSelect';

const chip = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium';

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; status?: string }> }) {
  const { q, error, status } = await searchParams;
  const [{ users, roles, me, isPlatformTeam }, placement] = await Promise.all([listUsersForAdmin(q), staffPlacementOptions()]);
  const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const branchName = new Map(placement.branches.map((b) => [b.id, b.name]));
  return (
    <div className="w-full p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Users</h1>
      <p className="mt-1 max-w-3xl text-sm text-[var(--ejo-text-muted)]">Everyone in your organisation and the roles they hold. Roles decide what each person can see and do (see Permissions). Every change is recorded in the audit trail.{isPlatformTeam ? ' As the platform team you can also grant the Master Administrator role.' : ''}</p>
      {error ? <p className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/5 p-3 text-sm text-[var(--ejo-error)]">{error}</p> : null}
      {status === 'saved' ? <p className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/5 p-3 text-sm text-[var(--ejo-text)]">Saved.</p> : null}
      {status === 'added' ? <p className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/5 p-3 text-sm text-[var(--ejo-text)]">Added. They have been emailed a link to set their own password.</p> : null}
      {status === 'added_no_email' ? <p className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5 p-3 text-sm text-[var(--ejo-text)]">Added, but the set-your-password email could not be sent. Ask them to use “Forgot password” on the sign-in page.</p> : null}

      <details className="mt-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--ejo-text)]">Add a staff member</summary>
        <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">They receive an email with a link to set their own password — no password is ever emailed or seen by you.{placement.branchLocked ? ' As a Branch Administrator you add people to your own branch.' : ''}</p>
        <form action={createStaffMemberFormAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]" htmlFor="fullName">Full name</label><input id="fullName" name="fullName" required minLength={2} className={field} /></div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]" htmlFor="email">Work email</label><input id="email" name="email" type="email" required className={field} /></div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]" htmlFor="employeeId">Employee ID (optional)</label><input id="employeeId" name="employeeId" className={field} /></div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]" htmlFor="phone">Phone (optional)</label><input id="phone" name="phone" className={field} /></div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]" htmlFor="branchId">Branch</label>
            <select id="branchId" name="branchId" required defaultValue={placement.branchLocked ?? ''} className={field}>
              {placement.branchLocked ? null : <option value="" disabled>Choose a branch…</option>}
              {placement.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]" htmlFor="departmentId">Department (optional)</label>
            <select id="departmentId" name="departmentId" defaultValue="" className={field}>
              <option value="">No department yet</option>
              {placement.departments.map((d) => <option key={d.id} value={d.id}>{d.name}{placement.branches.length > 1 ? ` — ${branchName.get(d.branchId) ?? ''}` : ''}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">First role (optional — more can be given below)</label>
            <FilterSelect name="roleId" ariaLabel="First role" placeholder="Type a role…" className="w-full" options={roles.filter((r) => !r.isPlatform).map((r) => ({ value: r.id, label: r.name }))} />
          </div>
          <div className="sm:col-span-2"><SubmitButton label="Add and send the set-password email" pendingLabel="Adding…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white" /></div>
        </form>
      </details>
      <form className="mt-4 max-w-md">
        <LiveSearchInput name="q" defaultValue={q ?? ''} placeholder="Search by name, email or employee ID…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
      </form>
      <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">{users.length} {users.length === 1 ? 'person' : 'people'}{users.length === 300 ? ' shown — search to narrow' : ''}</p>
      <ul className="mt-3 divide-y divide-[var(--ejo-border)] overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
        {users.map((u) => (
          <li key={u.id} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] md:items-start">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--ejo-text)]">{u.fullName}{u.id === me ? <span className="ml-1 text-[11px] text-[var(--ejo-text-muted)]">(you)</span> : null}</p>
              <p className="truncate text-xs text-[var(--ejo-text-muted)]">{u.email}</p>
              <p className="text-[11px] text-[var(--ejo-text-muted)]">{[u.employeeId, u.branch, u.department].filter(Boolean).join(' · ') || 'No branch or department set'} · <span className={u.isActive ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'}>{u.isActive ? 'Active' : 'Inactive'}</span></p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {u.roles.length === 0 ? <span className="text-xs text-[var(--ejo-text-muted)]">No role yet</span> : null}
              {u.roles.map((r) => (
                u.id === me || (r.isPlatform && !isPlatformTeam) ? (
                  <span key={r.id} className={`${chip} ${r.isPlatform ? 'bg-[var(--ejo-primary)] text-white' : 'bg-[var(--ejo-bg)] text-[var(--ejo-text)]'}`}>{r.isPlatform ? `Platform team — ${r.name}` : r.name}</span>
                ) : (
                  <form key={r.id} action={removeRoleFormAction} className={`${chip} ${r.isPlatform ? 'bg-[var(--ejo-primary)] text-white' : 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]'}`}>
                    <input type="hidden" name="userId" value={u.id} /><input type="hidden" name="roleId" value={r.id} /><input type="hidden" name="q" value={q ?? ''} />
                    {r.isPlatform ? `Platform team — ${r.name}` : r.name}
                    <SubmitButton label="×" pendingLabel="…" className="ml-1 rounded-full px-1 hover:bg-black/10" />
                  </form>
                )
              ))}
              {u.id !== me ? (
                <form action={assignRoleFormAction} className="flex items-center gap-1.5">
                  <input type="hidden" name="userId" value={u.id} /><input type="hidden" name="q" value={q ?? ''} />
                  <FilterSelect name="roleId" required ariaLabel={`Give ${u.fullName} a role`} placeholder="Type a role…" className="w-48" options={roles.filter((r) => !u.roles.some((x) => x.id === r.id)).map((r) => ({ value: r.id, label: r.isPlatform ? `${r.name} (platform team)` : r.name }))} />
                  <SubmitButton label="Give" pendingLabel="…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-2 py-1 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
                </form>
              ) : <span className="text-[11px] text-[var(--ejo-text-muted)]">Your own roles are changed by another administrator.</span>}
              {u.id !== me ? (
                <details className="ml-auto">
                  <summary className={`cursor-pointer text-[11px] font-medium ${u.isActive ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-success)]'}`}>{u.isActive ? 'Switch off…' : 'Switch back on…'}</summary>
                  <form action={setStaffActiveFormAction} className="mt-2 flex flex-wrap items-center gap-1.5">
                    <input type="hidden" name="userId" value={u.id} /><input type="hidden" name="active" value={u.isActive ? 'false' : 'true'} /><input type="hidden" name="q" value={q ?? ''} />
                    <input name="reason" required={u.isActive} minLength={u.isActive ? 3 : 0} placeholder={u.isActive ? 'Reason (e.g. left the company)' : 'Note (optional)'} className="w-56 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1 text-xs text-[var(--ejo-text)]" />
                    <SubmitButton label={u.isActive ? 'Switch off and sign out' : 'Switch on'} pendingLabel="…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-2 py-1 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
                  </form>
                </details>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
