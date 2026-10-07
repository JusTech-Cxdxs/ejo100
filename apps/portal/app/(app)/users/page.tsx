import { listUsersForAdmin, staffPlacementOptions } from '@/lib/actions/users-admin';
import { assignRoleFormAction, removeRoleFormAction, createStaffMemberFormAction, setStaffActiveFormAction, resendWelcomeFormAction, assignMissingEmployeeIdsFormAction } from '@/lib/actions/users-admin-form-handlers';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { SubmitButton } from '@/components/SubmitButton';
import { FilterSelect } from '@/components/FilterSelect';
import { Avatar } from '@/components/Avatar';

const chip = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium';
const banner = 'mt-3 rounded-[var(--ejo-radius-md)] border p-3 text-sm text-[var(--ejo-text)]';

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; status?: string; id?: string }> }) {
  const { q, error, status, id: rawId } = await searchParams;
  // Only something shaped like an employee ID is ever shown back.
  const id = rawId && /^[A-Z0-9-]{3,24}$/.test(rawId) ? rawId : undefined;
  const [{ users, roles, me, isPlatformTeam }, placement] = await Promise.all([listUsersForAdmin(q), staffPlacementOptions()]);
  const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const branchName = new Map(placement.branches.map((b) => [b.id, b.name]));
  const active = users.filter((u) => u.isActive).length;
  const withoutId = users.filter((u) => !u.employeeId && u.branch).length;
  const idsGiven = status?.startsWith('ids_') ? Number(status.slice(4)) : null;
  return (
    <div className="w-full p-4 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Users</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--ejo-text-muted)]">Everyone in your organisation and the roles they hold. Roles decide what each person can see and do (see Permissions); each person is emailed whenever their access changes. Every change is recorded in the audit trail.{isPlatformTeam ? ' As the platform team you can also grant the Master Administrator role.' : ''}</p>
        </div>
        <p className="text-sm text-[var(--ejo-text-muted)]"><span className="font-semibold text-[var(--ejo-text)]">{active}</span> active · {users.length - active} switched off</p>
      </div>
      {error ? <p className={`${banner} border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/5 !text-[var(--ejo-error)]`}>{error}</p> : null}
      {status === 'saved' ? <p className={`${banner} border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/5`}>Saved.</p> : null}
      {status === 'added' ? <p className={`${banner} border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/5`}>Added{id ? <> with employee ID <strong>{id}</strong></> : null}. Their welcome email — employee ID, role, what they can do, the rules and a link to set their own password — is on its way. The link works for 72 hours; after that they can use “Forgot password”.</p> : null}
      {status === 'added_no_email' ? <p className={`${banner} border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5`}>Added{id ? <> with employee ID <strong>{id}</strong></> : null}, but the welcome email could not be sent. Use “Send the welcome email again” on their card, or ask them to use “Forgot password” on the sign-in page.</p> : null}
      {status === 'welcome_sent' ? <p className={`${banner} border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/5`}>Welcome email sent again, with a new set-password link.</p> : null}
      {status === 'welcome_failed' ? <p className={`${banner} border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5`}>The welcome email could not be sent — check the mail settings (Settings → Email delivery), or ask them to use “Forgot password”.</p> : null}
      {idsGiven !== null ? <p className={`${banner} border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/5`}>{idsGiven === 0 ? 'Everyone already has an employee ID.' : `${idsGiven} employee ${idsGiven === 1 ? 'ID' : 'IDs'} issued.`}</p> : null}

      <details className="mt-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--ejo-text)]">Add a staff member</summary>
        <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">The employee ID is issued automatically for the branch (for example KN-ISO-0007). They receive a welcome email with their employee ID, role, what they can do, the rules, and a link to set their own password — no password is ever emailed or seen by you.{placement.branchLocked ? ' As a Branch Administrator you add people to your own branch.' : ''}</p>
        <form action={createStaffMemberFormAction} autoComplete="off" className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]" htmlFor="fullName">Full name</label><input id="fullName" name="fullName" required minLength={2} maxLength={120} autoComplete="off" className={field} /></div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]" htmlFor="email">Work email</label><input id="email" name="email" type="email" required maxLength={200} autoComplete="off" className={field} /></div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]" htmlFor="phone">Phone (optional)</label><input id="phone" name="phone" type="tel" maxLength={40} autoComplete="off" className={field} /></div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Branch</label>
            {placement.branchLocked ? (
              <><input type="hidden" name="branchId" value={placement.branchLocked} /><p className={`${field} bg-[var(--ejo-surface)]`}>{branchName.get(placement.branchLocked) ?? 'Your branch'}</p></>
            ) : (
              <FilterSelect name="branchId" required ariaLabel="Branch" placeholder="Type to find a branch…" className="w-full" options={placement.branches.map((b) => ({ value: b.id, label: b.name }))} />
            )}
          </div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Department (optional)</label>
            <FilterSelect name="departmentId" ariaLabel="Department" placeholder="Type to find a department…" className="w-full" options={placement.departments.map((d) => ({ value: d.id, label: d.name, group: placement.branches.length > 1 ? branchName.get(d.branchId) ?? '' : undefined }))} />
          </div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">First role (optional — more can be given later)</label>
            <FilterSelect name="roleId" ariaLabel="First role" placeholder="Type to find a role…" className="w-full" options={roles.filter((r) => !r.isPlatform).map((r) => ({ value: r.id, label: r.name }))} />
          </div>
          <div className="sm:col-span-2"><SubmitButton label="Add and send the welcome email" pendingLabel="Adding…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white" /></div>
        </form>
      </details>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <form className="w-full max-w-md">
          <LiveSearchInput name="q" defaultValue={q ?? ''} placeholder="Search by name, email or employee ID…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
        </form>
        {withoutId > 0 ? (
          <form action={assignMissingEmployeeIdsFormAction}>
            <input type="hidden" name="q" value={q ?? ''} />
            <SubmitButton label={`Issue employee IDs to ${withoutId} ${withoutId === 1 ? 'person' : 'people'} without one`} pendingLabel="Issuing…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]" />
          </form>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">{users.length} {users.length === 1 ? 'person' : 'people'}{users.length === 300 ? ' shown — search to narrow' : ''}</p>

      <ul className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {users.map((u) => (
          <li key={u.id} className={`flex flex-col rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 ${u.isActive ? '' : 'opacity-75'}`}>
            <div className="flex items-start gap-3">
              <Avatar name={u.fullName} size={48} active={u.isActive} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--ejo-text)]">{u.fullName}{u.id === me ? <span className="ml-1 text-[11px] font-normal text-[var(--ejo-text-muted)]">(you)</span> : null}</p>
                <p className="truncate text-xs text-[var(--ejo-text-muted)]">{u.email}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {u.employeeId ? <span className={`${chip} bg-[var(--ejo-bg)] font-mono text-[var(--ejo-text)]`} title="Employee ID">{u.employeeId}</span> : null}
                  <span className={`${chip} ${u.isActive ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]' : 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'}`}>{u.isActive ? 'Active' : 'Switched off'}</span>
                </div>
                <p className="mt-1 truncate text-[11px] text-[var(--ejo-text-muted)]">{[u.branch, u.department].filter(Boolean).join(' · ') || 'No branch or department set'}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--ejo-border)] pt-3">
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
                  <FilterSelect name="roleId" required ariaLabel={`Give ${u.fullName} a role`} placeholder="Type a role…" className="w-44" options={roles.filter((r) => !u.roles.some((x) => x.id === r.id)).map((r) => ({ value: r.id, label: r.isPlatform ? `${r.name} (platform team)` : r.name }))} />
                  <SubmitButton label="Give" pendingLabel="…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-2 py-1 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
                </form>
              ) : <span className="text-[11px] text-[var(--ejo-text-muted)]">Your own roles are changed by another administrator.</span>}
            </div>
            {u.id !== me ? (
              <details className="mt-auto pt-3">
                <summary className="cursor-pointer text-[11px] font-medium text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">More…</summary>
                <div className="mt-2 space-y-2">
                  {u.isActive ? (
                    <form action={resendWelcomeFormAction}>
                      <input type="hidden" name="userId" value={u.id} /><input type="hidden" name="q" value={q ?? ''} />
                      <SubmitButton label="Send the welcome email again" pendingLabel="Sending…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-2 py-1 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
                    </form>
                  ) : null}
                  <form action={setStaffActiveFormAction} className="flex flex-wrap items-center gap-1.5">
                    <input type="hidden" name="userId" value={u.id} /><input type="hidden" name="active" value={u.isActive ? 'false' : 'true'} /><input type="hidden" name="q" value={q ?? ''} />
                    <input name="reason" required={u.isActive} minLength={u.isActive ? 3 : 0} maxLength={200} placeholder={u.isActive ? 'Reason (e.g. left the company)' : 'Note (optional)'} className="min-w-0 flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1 text-xs text-[var(--ejo-text)]" />
                    <SubmitButton label={u.isActive ? 'Switch off and sign out' : 'Switch on'} pendingLabel="…" className={`rounded-[var(--ejo-radius-md)] border px-2 py-1 text-xs font-medium ${u.isActive ? 'border-[var(--ejo-error)]/40 text-[var(--ejo-error)]' : 'border-[var(--ejo-success)]/40 text-[var(--ejo-success)]'}`} />
                  </form>
                </div>
              </details>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
