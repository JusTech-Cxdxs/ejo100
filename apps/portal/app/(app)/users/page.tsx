import { guardPage } from '@/lib/authz/server';
import { listUsersForAdmin, staffPlacementOptions } from '@/lib/actions/users-admin';
import { assignRoleFormAction, removeRoleFormAction, setStaffActiveFormAction, resendWelcomeFormAction, assignMissingEmployeeIdsFormAction } from '@/lib/actions/users-admin-form-handlers';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { SubmitButton } from '@/components/SubmitButton';
import { FilterSelect } from '@/components/FilterSelect';
import { Avatar } from '@/components/Avatar';
import { redirect } from 'next/navigation';
import { PageTitle } from '@/components/ui';

const chip = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium';
const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const labelCls = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
const ghost = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-2.5 py-1 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]';

type Notice = { kind: 'success' | 'warning' | 'error'; title: string; text?: React.ReactNode };

function NoticeBox({ n }: { n: Notice }) {
  const tone = n.kind === 'success' ? 'var(--ejo-success)' : n.kind === 'warning' ? 'var(--ejo-warning)' : 'var(--ejo-error)';
  return (
    <div role={n.kind === 'error' ? 'alert' : 'status'} className="mt-4 flex items-start gap-3 rounded-[var(--ejo-radius-lg)] border bg-[var(--ejo-surface)] px-4 py-3" style={{ borderColor: `color-mix(in oklab, ${tone} 40%, transparent)` }}>
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: tone }} aria-hidden="true">{n.kind === 'success' ? '✓' : '!'}</span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-[var(--ejo-text)]">{n.title}</p>
        {n.text ? <p className="mt-0.5 text-[var(--ejo-text-muted)]">{n.text}</p> : null}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-4 py-3">
      <p className="text-2xl font-bold" style={{ color: tone ?? 'var(--ejo-text)' }}>{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ejo-text-muted)]">{label}</p>
    </div>
  );
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; status?: string; id?: string; show?: string; branch?: string; role?: string; add?: string }> }) {
  await guardPage('admin.users.manage', '/users');
  const sp = await searchParams;
  // Adding a person has its own page (old links still work).
  if (sp.add === '1') redirect('/users/new');
  const { q, error, status } = sp;
  // Only something shaped like an employee ID is ever shown back.
  const id = sp.id && /^[A-Z0-9-]{3,24}$/.test(sp.id) ? sp.id : undefined;
  const [{ users, roles, me, isPlatformTeam, counts }, placement] = await Promise.all([
    listUsersForAdmin(q, { status: sp.show, branchId: sp.branch, roleId: sp.role }),
    staffPlacementOptions(),
  ]);
  const idsGiven = status?.startsWith('ids_') ? Number(status.slice(4)) : null;
  const filtered = Boolean(q || sp.show || sp.branch || sp.role);

  const notice: Notice | null = error ? { kind: 'error', title: 'That didn’t work', text: error }
    : status === 'saved' ? { kind: 'success', title: 'Saved', text: 'The person has been emailed their updated access.' }
    : status === 'added' ? { kind: 'success', title: `Staff member added${id ? ` — employee ID ${id}` : ''}`, text: 'Their welcome email is on its way: employee ID, role, branch, what they can do, the rules, and a link to set their own password (valid 72 hours).' }
    : status === 'added_no_email' ? { kind: 'warning', title: `Staff member added${id ? ` — employee ID ${id}` : ''}, but the welcome email was not sent`, text: 'The mail server refused it — see Settings → Email delivery for the reason. Use “Send the welcome email again” on their card once mail is working.' }
    : status === 'welcome_sent' ? { kind: 'success', title: 'Welcome email sent again', text: 'With a new set-password link — any earlier link no longer works.' }
    : status === 'welcome_failed' ? { kind: 'warning', title: 'The welcome email could not be sent', text: 'The mail server refused it — see Settings → Email delivery for the reason.' }
    : idsGiven !== null ? { kind: 'success', title: idsGiven === 0 ? 'Everyone already has an employee ID' : `${idsGiven} employee ${idsGiven === 1 ? 'ID' : 'IDs'} issued` }
    : null;

  return (
    <div className="w-full max-w-7xl p-4 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <PageTitle icon="users">Users</PageTitle>
          <p className="mt-1 max-w-3xl text-sm text-[var(--ejo-text-muted)]">Everyone in your organisation{placement.branchLocked ? ' branch' : ''}, the branch and department they work in, and the roles that decide what they can see and do. People are emailed whenever their access changes; every change is in the audit trail.{isPlatformTeam ? ' As the platform team you can also grant the Master Administrator role.' : ''}</p>
        </div>
        <a href="/users/new" className="inline-flex items-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95">
          <span aria-hidden="true" className="text-base leading-none">+</span> Add staff member
        </a>
      </div>

      {notice ? <NoticeBox n={notice} /> : null}

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="People" value={counts.total} />
        <Stat label="Active" value={counts.active} tone="var(--ejo-success)" />
        <Stat label="Switched off" value={counts.off} tone={counts.off ? 'var(--ejo-text-muted)' : undefined} />
        <Stat label="Without employee ID" value={counts.withoutId} tone={counts.withoutId ? 'var(--ejo-warning)' : undefined} />
      </div>

      {/* Find people */}
      <form className="mt-6 flex flex-wrap items-end gap-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4" role="search">
        <div className="min-w-[14rem] flex-1">
          <label className={labelCls} htmlFor="q">Search</label>
          <LiveSearchInput id="q" name="q" defaultValue={q ?? ''} placeholder="Name, email or employee ID…" className={field} />
        </div>
        <div><label className={labelCls} htmlFor="show">Status</label>
          <select id="show" name="show" defaultValue={sp.show ?? ''} className={field}>
            <option value="">Everyone</option><option value="active">Active</option><option value="off">Switched off</option>
          </select>
        </div>
        {placement.branchLocked ? null : (
          <div><label className={labelCls} htmlFor="branch">Branch</label>
            <select id="branch" name="branch" defaultValue={sp.branch ?? ''} className={field}>
              <option value="">All branches</option>
              {placement.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <div><label className={labelCls} htmlFor="role">Role</label>
          <select id="role" name="role" defaultValue={sp.role ?? ''} className={field}>
            <option value="">All roles</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">Apply</button>
        {filtered ? <a href="/users" className="px-1 py-2 text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">Clear</a> : null}
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--ejo-text-muted)]">{users.length} {users.length === 1 ? 'person' : 'people'}{filtered ? ' match' : ''}{users.length === 300 ? ' shown — search to narrow' : ''}</p>
        {counts.withoutId > 0 ? (
          <form action={assignMissingEmployeeIdsFormAction}>
            <input type="hidden" name="q" value={q ?? ''} />
            <SubmitButton label={`Issue employee IDs to ${counts.withoutId} ${counts.withoutId === 1 ? 'person' : 'people'} without one`} pendingLabel="Issuing…" className={ghost} />
          </form>
        ) : null}
      </div>

      {users.length === 0 ? (
        <div className="mt-3 rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)] p-10 text-center">
          <p className="text-sm font-medium text-[var(--ejo-text)]">{filtered ? 'Nobody matches those filters.' : 'No staff yet.'}</p>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{filtered ? 'Try a different search, or clear the filters.' : <a href="/users/new" className="font-medium text-[var(--ejo-primary)] hover:underline">Add the first staff member</a>}</p>
        </div>
      ) : (
        <ul className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {users.map((u) => (
            <li key={u.id} className={`flex flex-col rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 transition-shadow hover:shadow-md ${u.isActive ? '' : 'opacity-80'}`} aria-label={u.fullName}>
              <div className="flex items-start gap-3">
                <Avatar name={u.fullName} size={48} active={u.isActive} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--ejo-text)]">{u.fullName}{u.id === me ? <span className="ml-1 text-[11px] font-normal text-[var(--ejo-text-muted)]">(you)</span> : null}</p>
                  <p className="truncate text-xs text-[var(--ejo-text-muted)]">{u.email}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {u.employeeId ? <span className={`${chip} bg-[var(--ejo-bg)] font-mono text-[var(--ejo-text)]`} title="Employee ID">{u.employeeId}</span> : <span className={`${chip} bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]`}>No employee ID</span>}
                    <span className={`${chip} ${u.isActive ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]' : 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'}`}>{u.isActive ? 'Active' : 'Switched off'}</span>
                  </div>
                  <p className="mt-1.5 truncate text-xs text-[var(--ejo-text-muted)]">{[u.branch, u.department].filter(Boolean).join(' · ') || 'No branch or department set'}</p>
                </div>
              </div>

              <div className="mt-3 border-t border-[var(--ejo-border)] pt-3">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Roles</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {u.roles.length === 0 ? <span className="text-xs text-[var(--ejo-text-muted)]">No role yet — they can only request exit passes.</span> : null}
                  {u.roles.map((r) => (
                    u.id === me || (r.isPlatform && !isPlatformTeam) ? (
                      <span key={r.id} className={`${chip} ${r.isPlatform ? 'bg-[var(--ejo-primary)] text-white' : 'bg-[var(--ejo-bg)] text-[var(--ejo-text)]'}`}>{r.isPlatform ? `Platform team — ${r.name}` : r.name}</span>
                    ) : (
                      <form key={r.id} action={removeRoleFormAction} className={`${chip} ${r.isPlatform ? 'bg-[var(--ejo-primary)] text-white' : 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]'}`}>
                        <input type="hidden" name="userId" value={u.id} /><input type="hidden" name="roleId" value={r.id} /><input type="hidden" name="q" value={q ?? ''} />
                        {r.isPlatform ? `Platform team — ${r.name}` : r.name}
                        <SubmitButton label="×" pendingLabel="…" className="ml-0.5 rounded-full px-1 leading-none hover:bg-[var(--ejo-primary)]/20" ariaLabel={`Remove the role ${r.name} from ${u.fullName}`} />
                      </form>
                    )
                  ))}
                </div>
                {u.id !== me ? (
                  <form action={assignRoleFormAction} className="mt-2 flex items-center gap-1.5">
                    <input type="hidden" name="userId" value={u.id} /><input type="hidden" name="q" value={q ?? ''} />
                    <FilterSelect name="roleId" required ariaLabel={`Give ${u.fullName} a role`} placeholder="Give a role…" className="min-w-0 flex-1" options={roles.filter((r) => !u.roles.some((x) => x.id === r.id)).map((r) => ({ value: r.id, label: r.isPlatform ? `${r.name} (platform team)` : r.name }))} />
                    <SubmitButton label="Give" pendingLabel="…" className={ghost} />
                  </form>
                ) : <p className="mt-2 text-[11px] text-[var(--ejo-text-muted)]">Your own roles are changed by another administrator.</p>}
              </div>

              {u.id !== me ? (
                <details className="mt-auto pt-3">
                  <summary className="cursor-pointer text-[11px] font-medium text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">More actions…</summary>
                  <div className="mt-2 space-y-2">
                    {u.isActive ? (
                      <form action={resendWelcomeFormAction}>
                        <input type="hidden" name="userId" value={u.id} /><input type="hidden" name="q" value={q ?? ''} />
                        <SubmitButton label="Send the welcome email again" pendingLabel="Sending…" className={ghost} />
                      </form>
                    ) : null}
                    <form action={setStaffActiveFormAction} className="flex flex-wrap items-center gap-1.5">
                      <input type="hidden" name="userId" value={u.id} /><input type="hidden" name="active" value={u.isActive ? 'false' : 'true'} /><input type="hidden" name="q" value={q ?? ''} />
                      <input name="reason" required={u.isActive} minLength={u.isActive ? 3 : 0} maxLength={200} aria-label={u.isActive ? 'Reason for switching off' : 'Note'} placeholder={u.isActive ? 'Reason (e.g. left the company)' : 'Note (optional)'} className="min-w-0 flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1 text-xs text-[var(--ejo-text)]" />
                      <SubmitButton label={u.isActive ? 'Switch off and sign out' : 'Switch on'} pendingLabel="…" className={`rounded-[var(--ejo-radius-md)] border px-2 py-1 text-xs font-medium ${u.isActive ? 'border-[var(--ejo-error)]/40 text-[var(--ejo-error)]' : 'border-[var(--ejo-success)]/40 text-[var(--ejo-success)]'}`} />
                    </form>
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
