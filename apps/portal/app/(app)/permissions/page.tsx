import { PERMISSIONS, ROLE_GRANTS, ROLE_LABELS, scopeFor, type PermissionKey } from '@/lib/authz/catalogue';
import { getPrincipal } from '@/lib/authz/server';
import { PermissionsMatrix, type MatrixRow } from '@/components/PermissionsMatrix';

/**
 * The Authorization Catalogue — generated from the same code the server
 * enforces, so it can never disagree with what actually happens.
 */
export default async function PermissionsPage() {
  const me = await getPrincipal();
  const slugs = Object.keys(ROLE_GRANTS);
  const keys = Object.keys(PERMISSIONS) as PermissionKey[];
  const rows: MatrixRow[] = keys.map((k) => ({
    key: k,
    module: PERMISSIONS[k].module,
    label: PERMISSIONS[k].label,
    scopes: slugs.map((r) => scopeFor({ userId: '', isSuperAdmin: false, roleSlugs: [r], branchId: null, departmentId: null }, k)),
  }));
  return (
    <div className="w-full p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Permissions</h1>
      <p className="mt-1 max-w-3xl text-sm text-[var(--ejo-text-muted)]">
        Who can do what, and on which records. Every page, action, search and list is checked against this on the server — hiding a button is never the protection.
        Reach: <b>Everything</b> · <b>Branch</b> (their branch) · <b>Department</b> · <b>Assigned</b> (records assigned to them) · <b>Own</b> (records they created).
        A person with several roles gets everything those roles allow together. Organisations add permissions to a role on the Roles page.
        {me.isSuperAdmin ? ' (Platform team: you hold every permission; organisations never see the platform role.)' : ''}
      </p>
      <PermissionsMatrix roles={slugs.map((s) => ROLE_LABELS[s] ?? s)} rows={rows} />
    </div>
  );
}
