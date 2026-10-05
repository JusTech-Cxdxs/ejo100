import { listUsersForAdmin } from '@/lib/actions/users-admin';
import { assignRoleFormAction, removeRoleFormAction } from '@/lib/actions/users-admin-form-handlers';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { SubmitButton } from '@/components/SubmitButton';

const chip = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium';

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; status?: string }> }) {
  const { q, error, status } = await searchParams;
  const { users, roles, me, isPlatformTeam } = await listUsersForAdmin(q);
  return (
    <div className="w-full p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Users</h1>
      <p className="mt-1 max-w-3xl text-sm text-[var(--ejo-text-muted)]">Everyone in your organisation and the roles they hold. Roles decide what each person can see and do (see Permissions). Every change is recorded in the audit trail.{isPlatformTeam ? ' As the platform team you can also grant the Master Administrator role.' : ''}</p>
      {error ? <p className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/5 p-3 text-sm text-[var(--ejo-error)]">{error}</p> : null}
      {status === 'saved' ? <p className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/5 p-3 text-sm text-[var(--ejo-text)]">Saved.</p> : null}
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
                  <select name="roleId" required defaultValue="" aria-label={`Give ${u.fullName} a role`} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1 text-xs text-[var(--ejo-text)]">
                    <option value="" disabled>Give a role…</option>
                    {roles.filter((r) => !u.roles.some((x) => x.id === r.id)).map((r) => <option key={r.id} value={r.id}>{r.isPlatform ? `${r.name} (platform team)` : r.name}</option>)}
                  </select>
                  <SubmitButton label="Give" pendingLabel="…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-2 py-1 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
                </form>
              ) : <span className="text-[11px] text-[var(--ejo-text-muted)]">Your own roles are changed by another administrator.</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
