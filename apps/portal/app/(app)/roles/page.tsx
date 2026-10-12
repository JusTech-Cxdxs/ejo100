import { guardPage } from '@/lib/authz/server';
import { listRolesForEditor } from '@/lib/actions/roles';
import { grantRolePermissionFormAction, revokeRolePermissionFormAction } from '@/lib/actions/roles-form-handlers';
import { APPROVAL_PERMISSIONS, PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_GRANTS, SCOPE_WORDS, type PermissionKey } from '@/lib/authz/catalogue';
import { SubmitButton } from '@/components/SubmitButton';
import { plainLabel } from '@/lib/authz/describe-access';
import { FilterSelect } from '@/components/FilterSelect';
import { PageHeader } from '@/components/ui';

const chip = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium';

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string }> }) {
  await guardPage('admin.roles.manage', '/roles');
  const { error, status } = await searchParams;
  const roles = await listRolesForEditor();
  const all = Object.keys(PERMISSIONS) as PermissionKey[];
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        icon="shield"
        title="Roles"
        description={<>What each role is for, what it can do and what it can approve. <b>Included by default</b> comes from the platform catalogue; you can <b>add</b> more for your organisation (and remove what you added). Every change is recorded in the audit trail. The full picture is on the Permissions page.</>}
      />
      {error ? <p className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/5 p-3 text-sm text-[var(--ejo-error)]">{error}</p> : null}
      {status === 'saved' ? <p className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/5 p-3 text-sm text-[var(--ejo-text)]">Saved.</p> : null}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {roles.map((r) => (
          <section key={r.id} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">{r.name}</h2>
              <span className="text-xs text-[var(--ejo-text-muted)]">{r.users} {r.users === 1 ? 'person' : 'people'}</span>
            </div>
            {r.isPlatform ? (
              <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Platform team (the platform owner and their support staff). Holds every permission. Organisations cannot grant or change this role.</p>
            ) : (
              <>
                {ROLE_DESCRIPTIONS[r.slug] ? <p className="mt-2 text-sm text-[var(--ejo-text)]">{ROLE_DESCRIPTIONS[r.slug]}</p> : null}
                {(() => {
                  const scope = (k: PermissionKey) => { const sc = ROLE_GRANTS[r.slug]?.[k]; return sc ? SCOPE_WORDS[sc] : null; };
                  const approves = r.defaults.filter((k) => APPROVAL_PERMISSIONS.includes(k));
                  const does = r.defaults.filter((k) => !APPROVAL_PERMISSIONS.includes(k));
                  const List = ({ title, keys }: { title: string; keys: PermissionKey[] }) => (keys.length ? (
                    <>
                      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{title}</p>
                      <ul className="mt-1 space-y-1 text-xs text-[var(--ejo-text)]">
                        {keys.map((k) => <li key={k} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ejo-primary)]" aria-hidden="true" /><span>{plainLabel(PERMISSIONS[k].label)}{scope(k) ? <span className="text-[var(--ejo-text-muted)]"> — {scope(k)}</span> : null}</span></li>)}
                      </ul>
                    </>
                  ) : null);
                  return r.defaults.length ? (
                    <>
                      <List title="Included by default — can do" keys={does} />
                      <List title="Included by default — can approve" keys={approves} />
                    </>
                  ) : <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">No defaults. Everyone can request their own exit pass and see their own notifications.</p>;
                })()}
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Added for this organisation</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {r.added.length ? r.added.map((k) => (
                    <form key={k} action={revokeRolePermissionFormAction} className={`${chip} bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]`}>
                      <input type="hidden" name="roleId" value={r.id} /><input type="hidden" name="key" value={k} />
                      {PERMISSIONS[k].label}
                      <SubmitButton label="×" pendingLabel="…" className="ml-1 rounded-full px-1 text-[var(--ejo-primary)] hover:bg-[var(--ejo-primary)]/20" />
                    </form>
                  )) : <span className="text-xs text-[var(--ejo-text-muted)]">Nothing added.</span>}
                </div>
                <form action={grantRolePermissionFormAction} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="roleId" value={r.id} />
                  <FilterSelect name="key" required ariaLabel={`Add a permission to ${r.name}`} placeholder="Type to find a permission…" className="flex-1" options={all.filter((k) => !r.defaults.includes(k) && !r.added.includes(k)).map((k) => ({ value: k, label: PERMISSIONS[k].label, group: PERMISSIONS[k].module }))} />
                  <SubmitButton label="Add" pendingLabel="Adding…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90" />
                </form>
              </>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
