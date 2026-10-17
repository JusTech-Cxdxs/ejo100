import { notFound } from 'next/navigation';
import { guardPage, getPrincipal } from '@/lib/authz/server';
import { listRoleHolders, listRolesForEditor } from '@/lib/actions/roles';
import { grantRolePermissionFormAction, revokeRolePermissionFormAction } from '@/lib/actions/roles-form-handlers';
import { APPROVAL_PERMISSIONS, PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_GRANTS, SCOPE_WORDS, type PermissionKey } from '@/lib/authz/catalogue';
import { plainLabel } from '@/lib/authz/describe-access';
import { SubmitButton } from '@/components/SubmitButton';
import { FilterSelect } from '@/components/FilterSelect';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { LoadingLink } from '@/components/LoadingLink';
import { EditableSection, PageHeader, SectionCard, StatusChip } from '@/components/ui';
import { pluralize } from '@/lib/utils/pluralize';

export const metadata = { title: 'Role' };

/** Permissions grouped by module, in plain words, with the reach each has. */
function Grouped({ keys, scope }: { keys: PermissionKey[]; scope: (k: PermissionKey) => string | null }) {
  const modules = [...new Set(keys.map((k) => PERMISSIONS[k].module))];
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {modules.map((m) => (
        <div key={m} className="min-w-0">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{m}</p>
          <ul className="space-y-1.5 text-sm text-[var(--ejo-text)]">
            {keys.filter((k) => PERMISSIONS[k].module === m).map((k) => (
              <li key={k} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ejo-primary)]" aria-hidden="true" /><span className="min-w-0">{plainLabel(PERMISSIONS[k].label)}{scope(k) ? <span className="text-[var(--ejo-text-muted)]"> — {scope(k)}</span> : null}</span></li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * One role: what it is for, everything it can do and approve (with reach),
 * what this organisation added, and who holds it. Adding or removing a
 * permission is behind "Change permissions" — read first, changed on purpose.
 */
export default async function RolePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; error?: string; status?: string }> }) {
  await guardPage('admin.roles.manage', '/roles');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const roles = await listRolesForEditor();
  const r = roles.find((x) => x.id === id);
  if (!r) notFound();
  const [holders, me] = await Promise.all([listRoleHolders(r.id), getPrincipal()]);
  const scope = (k: PermissionKey) => { const sc = ROLE_GRANTS[r.slug]?.[k]; return sc ? SCOPE_WORDS[sc] : null; };
  const approves = r.defaults.filter((k) => APPROVAL_PERMISSIONS.includes(k));
  const does = r.defaults.filter((k) => !APPROVAL_PERMISSIONS.includes(k));
  const holdsIt = !me.isSuperAdmin && me.roleSlugs.includes(r.slug);
  const here = `/roles/${r.id}`;
  const addable = (Object.keys(PERMISSIONS) as PermissionKey[]).filter((k) => !r.defaults.includes(k) && !r.added.includes(k));

  return (
    <div className="w-full max-w-6xl p-4 sm:p-8">
      <PageHeader
        icon="shield"
        title={r.name}
        description={r.isPlatform ? 'The platform owner and their support staff. Holds every permission; organisations cannot grant or change this role.' : ROLE_DESCRIPTIONS[r.slug] ?? 'A role your organisation set up.'}
        back={{ href: '/roles', label: 'All roles' }}
        meta={<span className="text-xs text-[var(--ejo-text-muted)]">{pluralize(r.users, 'person', 'people')} · {does.length} can do · {approves.length ? `${approves.length} can approve` : 'approves nothing'}{r.added.length ? ` · ${r.added.length} added here` : ''}</span>}
      />
      {sp.error ? <FormFeedbackBanner kind="error" message={sp.error} /> : null}
      {sp.status === 'saved' ? <FormFeedbackBanner kind="success" message="Saved. Everyone who holds this role has been emailed the change." /> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {r.isPlatform ? null : (
            <>
              <SectionCard icon="check-circle" title="Included by default — can do" description="From the platform catalogue (reviewed code), with how far each reaches.">
                {does.length ? <Grouped keys={does} scope={scope} /> : <p className="text-sm text-[var(--ejo-text-muted)]">No defaults. Everyone can request their own exit pass and see their own notifications.</p>}
              </SectionCard>
              <SectionCard icon="shield-check" title="Included by default — can approve" description="Each one a step that waits on a named person. Nobody approves their own request.">
                {approves.length ? <Grouped keys={approves} scope={scope} /> : <p className="text-sm text-[var(--ejo-text-muted)]">This role approves nothing.</p>}
              </SectionCard>
              <EditableSection
                id="perms" icon="key" title="Added for this organisation"
                description="Extra permissions your organisation gave this role, on top of the defaults."
                editing={sp.edit === 'perms' && !holdsIt} editHref={`${here}?edit=perms#perms`} cancelHref={`${here}#perms`} editLabel="Change permissions"
                view={(
                  <div className="space-y-2">
                    {r.added.length ? (
                      <ul className="flex flex-wrap gap-1.5">{r.added.map((k) => <li key={k}><StatusChip tone="brand" label={PERMISSIONS[k].label} /></li>)}</ul>
                    ) : <p className="text-sm text-[var(--ejo-text-muted)]">Nothing added — this role has exactly its defaults.</p>}
                    {holdsIt ? <p className="text-xs text-[var(--ejo-text-muted)]">You hold this role, so another administrator changes it.</p> : null}
                  </div>
                )}
              >
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-medium text-[var(--ejo-text-muted)]">Added now — remove one with ×</p>
                    <div className="flex flex-wrap gap-1.5">
                      {r.added.length ? r.added.map((k) => (
                        <form key={k} action={revokeRolePermissionFormAction} className="inline-flex items-center gap-1 rounded-full bg-[var(--ejo-primary)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-primary)]">
                          <input type="hidden" name="roleId" value={r.id} /><input type="hidden" name="key" value={k} />
                          {PERMISSIONS[k].label}
                          <SubmitButton label="×" pendingLabel="…" ariaLabel={`Remove ${PERMISSIONS[k].label}`} className="ml-1 rounded-full px-1 text-[var(--ejo-primary)] hover:bg-[var(--ejo-primary)]/20" />
                        </form>
                      )) : <span className="text-sm text-[var(--ejo-text-muted)]">Nothing added yet.</span>}
                    </div>
                  </div>
                  <form action={grantRolePermissionFormAction} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <input type="hidden" name="roleId" value={r.id} />
                    <div className="min-w-0 flex-1">
                      <FilterSelect name="key" required large ariaLabel={`Add a permission to ${r.name}`} placeholder="Type to find a permission…" className="w-full" options={addable.map((k) => ({ value: k, label: PERMISSIONS[k].label, group: PERMISSIONS[k].module }))} />
                      <p className="mt-1.5 text-xs text-[var(--ejo-text-muted)]">Added permissions reach the holder&apos;s own branch. The people who hold the role are emailed.</p>
                    </div>
                    <SubmitButton label="Add permission" pendingLabel="Adding…" className="min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 text-sm font-semibold text-white hover:opacity-90" />
                  </form>
                </div>
              </EditableSection>
            </>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <SectionCard icon="users" title={`Who holds it · ${holders.length}`} flush>
            {holders.length ? (
              <ul className="max-h-[28rem] divide-y divide-[var(--ejo-border)] overflow-y-auto">
                {holders.map((h) => (
                  <li key={h.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium text-[var(--ejo-text)]">{h.fullName}</span><span className="block truncate text-xs text-[var(--ejo-text-muted)]">{h.branch ?? 'No branch'}</span></span>
                    {h.isActive ? null : <StatusChip tone="neutral" label="Switched off" />}
                  </li>
                ))}
              </ul>
            ) : <p className="p-4 text-sm text-[var(--ejo-text-muted)]">Nobody holds this role yet.</p>}
            <div className="border-t border-[var(--ejo-border)] p-3"><LoadingLink href={`/users?role=${r.id}`} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">Give or remove it on Users →</LoadingLink></div>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
