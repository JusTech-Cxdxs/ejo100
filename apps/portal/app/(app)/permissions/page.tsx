import { PERMISSIONS, ROLE_GRANTS, ROLE_LABELS, ROLE_INFO, APPROVAL_CHAINS, scopeFor, type PermissionKey } from '@/lib/authz/catalogue';
import { getPrincipal } from '@/lib/authz/server';
import { PermissionsExplorer, type ExplorerRole, type ExplorerPermission } from '@/components/PermissionsExplorer';

/**
 * The Authorization Catalogue — generated from the same code the server
 * enforces, so this page can never disagree with what actually happens.
 */
export default async function PermissionsPage() {
  const principal = await getPrincipal();
  const slugs = Object.keys(ROLE_GRANTS);
  const keys = Object.keys(PERMISSIONS) as PermissionKey[];
  const label = (s: string) => ROLE_LABELS[s] ?? s;
  const scope = (slug: string, k: PermissionKey) => scopeFor({ userId: '', isSuperAdmin: false, roleSlugs: [slug], branchId: null, departmentId: null }, k);
  const roles: ExplorerRole[] = slugs.map((s) => ({
    slug: s, label: label(s), summary: ROLE_INFO[s]?.summary ?? '', does: ROLE_INFO[s]?.does ?? [],
    grants: keys.flatMap((k) => { const sc = scope(s, k); return sc ? [{ key: k, label: PERMISSIONS[k].label, module: PERMISSIONS[k].module, scope: sc }] : []; }),
  }));
  const permissions: ExplorerPermission[] = keys.map((k) => ({
    key: k, label: PERMISSIONS[k].label, module: PERMISSIONS[k].module,
    holders: slugs.flatMap((s) => { const sc = scope(s, k); return sc ? [{ label: label(s), scope: sc }] : []; }),
  }));
  return (
    <div className="w-full p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Permissions</h1>
      <p className="mt-1 max-w-3xl text-sm text-[var(--ejo-text-muted)]">
        What each role does and on which records — checked on the server for every page, action, list and search (hiding a button is never the protection).
        A person can hold several roles (for example Receptionist and Broadcaster) and gets everything all of them allow. Extra permissions can be added to a role on the Roles page.
        {principal.isSuperAdmin ? ' Platform team: you hold everything; organisations never see the platform role.' : ''}
      </p>
      <div className="mt-2">
        <PermissionsExplorer roles={roles} permissions={permissions} chains={APPROVAL_CHAINS} />
      </div>
      <p className="mt-4 text-xs text-[var(--ejo-text-muted)]">{keys.length} permissions · {new Set(keys.map((k) => PERMISSIONS[k].module)).size} areas · {slugs.length} roles · {APPROVAL_CHAINS.length} approval chains.</p>
    </div>
  );
}
