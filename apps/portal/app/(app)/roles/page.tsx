import { guardPage } from '@/lib/authz/server';
import { listRolesForEditor } from '@/lib/actions/roles';
import { APPROVAL_PERMISSIONS, ROLE_DESCRIPTIONS } from '@/lib/authz/catalogue';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { Icon, PageHeader, StatusChip } from '@/components/ui';
import { pluralize } from '@/lib/utils/pluralize';

export const metadata = { title: 'Roles' };

/** Where each role belongs, so the list reads like the organisation. */
const GROUPS: { title: string; slugs: string[] }[] = [
  { title: 'Leadership and headquarters', slugs: ['executive', 'administrator', 'it-administrator', 'branch-administrator'] },
  { title: 'Workshop', slugs: ['workshop-manager', 'workshop-supervisor', 'technician', 'receptionist'] },
  { title: 'Money, store and warranty', slugs: ['finance-officer', 'store-manager', 'store-officer', 'warranty-hod', 'warranty-officer'] },
  { title: 'Customers and support', slugs: ['customer-care-lead', 'customer-care'] },
  { title: 'Security, departments and everyday tools', slugs: ['chief-security-officer', 'security-officer', 'department-head', 'scheduling-admin', 'calendar-user', 'broadcaster', 'branch-assistant'] },
];

/**
 * Roles, read first: every role grouped by where it works, what it is for,
 * how many people hold it and how much it can do. Each opens its own page,
 * where its permissions are listed and changed on purpose.
 */
export default async function RolesPage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string }> }) {
  await guardPage('admin.roles.manage', '/roles');
  const { error } = await searchParams;
  const roles = await listRolesForEditor();
  const placed = new Set(GROUPS.flatMap((g) => g.slugs));
  const groups = [...GROUPS.map((g) => ({ title: g.title, roles: g.slugs.map((s) => roles.find((r) => r.slug === s)).filter((r): r is (typeof roles)[number] => Boolean(r)) })),
    { title: 'Set up by your organisation', roles: roles.filter((r) => !placed.has(r.slug) && !r.isPlatform) },
    { title: 'Platform team', roles: roles.filter((r) => r.isPlatform) }].filter((g) => g.roles.length);
  const people = roles.reduce((n, r) => n + r.users, 0);
  const added = roles.reduce((n, r) => n + r.added.length, 0);

  return (
    <div className="w-full max-w-7xl p-4 sm:p-8">
      <PageHeader
        icon="shield"
        title="Roles"
        description="What each role is for, what it can do and what it can approve. Open a role to see everything it allows and who holds it, and to add permissions for your organisation. Every change is in the audit trail and emailed to the people who hold the role."
      />
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}

      <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Roles', value: roles.filter((r) => !r.isPlatform).length },
          { label: 'Role assignments', value: people },
          { label: 'Permissions added here', value: added },
          { label: 'Approval steps covered', value: APPROVAL_PERMISSIONS.length },
        ].map((s) => (
          <div key={s.label} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-4 py-3">
            <dd className="text-2xl font-bold tabular-nums text-[var(--ejo-text)]">{s.value}</dd>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--ejo-text-muted)]">{s.label}</dt>
          </div>
        ))}
      </dl>

      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.title} aria-labelledby={`g-${g.title}`}>
            <h2 id={`g-${g.title}`} className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{g.title}</h2>
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {g.roles.map((r) => {
                const approves = r.defaults.filter((k) => APPROVAL_PERMISSIONS.includes(k)).length;
                const does = r.defaults.length - approves;
                return (
                  <li key={r.id}>
                    <LoadingLink href={`/roles/${r.id}`} className="flex h-full flex-col rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 transition hover:border-[var(--ejo-primary)]/50 hover:shadow-md" aria-label={`${r.name}: open`}>
                      <section className="flex h-full flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold text-[var(--ejo-text)]">{r.name}</h3>
                          <StatusChip tone={r.users ? 'brand' : 'neutral'} label={pluralize(r.users, 'person', 'people')} />
                        </div>
                        <p className="mt-2 line-clamp-3 text-sm text-[var(--ejo-text-muted)]">{r.isPlatform ? 'The platform owner and their support staff. Holds every permission; organisations cannot grant or change it.' : ROLE_DESCRIPTIONS[r.slug] ?? 'A role your organisation set up.'}</p>
                        <p className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-3 text-xs text-[var(--ejo-text-muted)]">
                          {r.isPlatform ? <span>Everything</span> : <>
                            <span>{does} can do</span>
                            <span>{approves ? `${approves} can approve` : 'approves nothing'}</span>
                            {r.added.length ? <span className="font-medium text-[var(--ejo-primary)]">+{r.added.length} added here</span> : null}
                          </>}
                          <span className="ml-auto inline-flex items-center gap-1 font-medium text-[var(--ejo-primary)]">Open<Icon name="arrow-right" size={12} /></span>
                        </p>
                      </section>
                    </LoadingLink>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
