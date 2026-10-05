import { Fragment } from 'react';
import { PERMISSIONS, ROLE_GRANTS, scopeFor, type PermissionKey, type Scope } from '@/lib/authz/catalogue';

const SCOPE_LABEL: Record<Scope, string> = { ALL: 'Everything', BRANCH: 'Branch', DEPARTMENT: 'Department', ASSIGNED: 'Assigned', OWN: 'Own' };
const SCOPE_TONE: Record<Scope, string> = {
  ALL: 'bg-[var(--ejo-primary)]/15 text-[var(--ejo-primary)]', BRANCH: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  DEPARTMENT: 'bg-purple-500/15 text-purple-600', ASSIGNED: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]', OWN: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
};
const ROLE_NAME = (slug: string) => slug.split('-').map((w, i) => (i === 0 ? w[0]!.toUpperCase() + w.slice(1) : w)).join(' ').replace('Hod', 'HOD');

/**
 * The Authorization Catalogue — generated from the same code the server
 * enforces, so this page can never disagree with what actually happens.
 */
export default function PermissionsPage() {
  const roles = Object.keys(ROLE_GRANTS);
  const keys = Object.keys(PERMISSIONS) as PermissionKey[];
  const modules = [...new Set(keys.map((k) => PERMISSIONS[k].module))];
  return (
    <div className="w-full p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Permissions</h1>
      <p className="mt-1 max-w-3xl text-sm text-[var(--ejo-text-muted)]">
        Who can do what, and on which records. Every page, action, search and notification is checked against this on the server — hiding a button is never the protection.
        Scope: <b>Everything</b> · <b>Branch</b> (their branch) · <b>Department</b> · <b>Assigned</b> (records assigned to them) · <b>Own</b> (records they created). The Master Administrator holds everything.
      </p>
      <div className="mt-4 overflow-x-auto rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
        <table className="w-full min-w-[60rem] text-xs">
          <thead className="bg-[var(--ejo-bg)]">
            <tr>
              <th className="sticky left-0 z-10 bg-[var(--ejo-bg)] px-3 py-2 text-left font-semibold text-[var(--ejo-text)]">Permission</th>
              {roles.map((r) => <th key={r} className="px-2 py-2 text-left font-medium text-[var(--ejo-text-muted)] [writing-mode:vertical-rl] sm:[writing-mode:horizontal-tb]">{ROLE_NAME(r)}</th>)}
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <Fragment key={m}>
                <tr className="border-t border-[var(--ejo-border)] bg-[var(--ejo-bg)]/60"><td colSpan={roles.length + 1} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{m}</td></tr>
                {keys.filter((k) => PERMISSIONS[k].module === m).map((k) => (
                  <tr key={k} className="border-t border-[var(--ejo-border)]">
                    <td className="sticky left-0 z-10 bg-[var(--ejo-surface)] px-3 py-1.5 text-[var(--ejo-text)]">{PERMISSIONS[k].label}</td>
                    {roles.map((r) => {
                      const s = scopeFor({ userId: '', isSuperAdmin: false, roleSlugs: [r], branchId: null, departmentId: null }, k);
                      return <td key={r} className="px-2 py-1.5">{s ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SCOPE_TONE[s]}`}>{SCOPE_LABEL[s]}</span> : <span className="text-[var(--ejo-text-muted)]">—</span>}</td>;
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">{keys.length} permissions across {modules.length} areas and {roles.length} roles. Changing what a permission means is a reviewed code change; adding grants per organisation comes with the role editor.</p>
    </div>
  );
}
