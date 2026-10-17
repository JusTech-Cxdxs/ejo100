import { guardPage } from '@/lib/authz/server';
import { rolesForNewStaff, staffPlacementOptions } from '@/lib/actions/users-admin';
import { ROLE_DESCRIPTIONS } from '@/lib/authz/catalogue';
import { AddStaffForm } from '@/components/AddStaffForm';
import { Icon, PageHeader, SectionCard } from '@/components/ui';

export const metadata = { title: 'Add a staff member' };

/**
 * Adding a person has its own page: three clear steps on the left, and on the
 * right what happens when they are added — nothing squeezed above the list of
 * people, nothing drawn over it.
 */
export default async function AddStaffPage() {
  await guardPage('admin.users.manage', '/users');
  const [roles, placement] = await Promise.all([rolesForNewStaff(), staffPlacementOptions()]);
  const branchName = new Map(placement.branches.map((b) => [b.id, b.name]));
  const next: { icon: 'badge' | 'mail' | 'key' | 'history'; title: string; text: string }[] = [
    { icon: 'badge', title: 'An employee ID is issued', text: 'Automatically, from the branch: organisation, branch and a number. Nobody types it.' },
    { icon: 'mail', title: 'A welcome email goes to them', text: 'Their employee ID, role, branch, exactly what they may do, the house rules, and a link to set their own password (valid 72 hours).' },
    { icon: 'key', title: 'They choose their own password', text: 'You never see it and it is never emailed. If the link runs out, send the welcome again from their card.' },
    { icon: 'history', title: 'It is all on record', text: 'Adding them, every role change and every switch-off is in the audit trail, and they are emailed whenever their access changes.' },
  ];
  return (
    <div className="w-full max-w-6xl p-4 sm:p-8">
      <PageHeader
        icon="user-plus"
        title="Add a staff member"
        description={placement.branchLocked ? `To ${branchName.get(placement.branchLocked) ?? 'your branch'}. Administrator roles are given by headquarters.` : 'To any branch of the organisation.'}
        back={{ href: '/users', label: 'Back to Users' }}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div id="add-staff">
          <AddStaffForm
            branchLocked={placement.branchLocked}
            lockedBranchName={placement.branchLocked ? branchName.get(placement.branchLocked) : undefined}
            branches={placement.branches.map((b) => ({ value: b.id, label: b.name }))}
            departments={placement.departments.map((d) => ({ value: d.id, label: d.name, branchId: d.branchId }))}
            roles={roles.filter((r) => !r.isPlatform).map((r) => ({ value: r.id, label: r.name, description: ROLE_DESCRIPTIONS[r.slug] }))}
          />
        </div>
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <SectionCard icon="info" title="When you add them">
            <ol className="space-y-4">
              {next.map((s) => (
                <li key={s.title} className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]" aria-hidden="true"><Icon name={s.icon} size={14} /></span>
                  <span className="min-w-0"><span className="block text-sm font-medium text-[var(--ejo-text)]">{s.title}</span><span className="block text-xs leading-relaxed text-[var(--ejo-text-muted)]">{s.text}</span></span>
                </li>
              ))}
            </ol>
          </SectionCard>
          <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3 text-xs leading-relaxed text-[var(--ejo-text-muted)]">Someone leaving? Switch their account off from their card on Users: they are signed out everywhere at once and nothing they did is changed.</p>
        </aside>
      </div>
    </div>
  );
}
