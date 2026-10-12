import { PERMISSIONS, ROLE_GRANTS, ROLE_LABELS, PLATFORM_ONLY, scopeFor, type PermissionKey } from '@/lib/authz/catalogue';
import { getPrincipal, guardPage } from '@/lib/authz/server';
import { PermissionsMatrix, type MatrixRow } from '@/components/PermissionsMatrix';
import { PageHeader } from '@/components/ui';
import { pluralize } from '@/lib/utils/pluralize';

/**
 * The Authorization Catalogue — generated from the same code the server
 * enforces, so it can never disagree with what actually happens.
 */
export default async function PermissionsPage() {
  await guardPage('admin.roles.manage', '/permissions');
  const me = await getPrincipal();
  const slugs = Object.keys(ROLE_GRANTS);
  const keys = Object.keys(PERMISSIONS) as PermissionKey[];
  const rows: MatrixRow[] = keys.map((k) => ({
    key: k,
    module: PERMISSIONS[k].module,
    label: PERMISSIONS[k].label,
    cells: slugs.map((r) => scopeFor({ userId: '', isSuperAdmin: false, roleSlugs: [r], branchId: null, departmentId: null }, k)),
  }));
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        icon="key"
        title="Permissions"
        description={<>Who can do what, and on which records. Each department does its own work and sees only what that work needs — Front Desk opens jobs, supervisors and
        technicians do the work, the Manager approves and closes, Finance handles money, the Store handles stock, Security runs the gate. Every rule is checked on
        the server for every page, action, list and search. A person with several roles (for example Front Desk and Broadcaster) gets what those roles allow together.
        Headquarters can add a permission to a role on the Roles page.</>}
      />
      <PermissionsMatrix roles={slugs.map((s) => ROLE_LABELS[s] ?? s)} rows={rows} />
      <p className="mt-4 text-xs text-[var(--ejo-text-muted)]">{pluralize(keys.length, 'permission')} across {pluralize(new Set(keys.map((k) => PERMISSIONS[k].module)).size, 'area')} and {pluralize(slugs.length, 'role')}.</p>
      {me.isSuperAdmin ? (
        <div className="mt-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 text-xs text-[var(--ejo-text-muted)]">
          <p className="font-semibold text-[var(--ejo-text)]">Platform team only (organisations never see this)</p>
          <p className="mt-0.5">You hold every permission. These steps are reserved for the platform team:</p>
          <ul className="mt-1 list-disc pl-4">{PLATFORM_ONLY.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}
