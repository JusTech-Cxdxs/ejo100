import { PERMISSIONS, ROLE_GRANTS, ROLE_LABELS, scopeFor, type PermissionKey, type Principal, type Scope } from './catalogue';

/**
 * A person's access in plain words — exactly what the catalogue grants them
 * right now (their roles' defaults plus anything an administrator added to a
 * role). Used in the welcome / access-changed emails and on the profile
 * page, so what people are told always matches what the system enforces.
 */
export type AccessLine = { key: PermissionKey; label: string; where: string; added: boolean };
export type AccessGroup = { module: string; lines: AccessLine[] };

const WHERE: Record<Scope, string> = {
  ALL: 'across the whole organisation',
  BRANCH: 'in your branch',
  DEPARTMENT: 'in your department',
  ASSIGNED: 'on work assigned to you',
  OWN: 'for yourself',
};

export function describeAccess(p: Principal): AccessGroup[] {
  if (p.isSuperAdmin) return [{ module: 'Platform', lines: [] }];
  const byModule = new Map<string, AccessLine[]>();
  for (const key of Object.keys(PERMISSIONS) as PermissionKey[]) {
    const scope = scopeFor(p, key);
    if (!scope) continue;
    const fromRoles = p.roleSlugs.some((s) => ROLE_GRANTS[s]?.[key]);
    const added = !fromRoles && Boolean(p.extraGrants?.[key]);
    const { module, label } = PERMISSIONS[key];
    const list = byModule.get(module) ?? [];
    list.push({ key, label, where: WHERE[scope], added });
    byModule.set(module, list);
  }
  return [...byModule.entries()].map(([module, lines]) => ({ module, lines }));
}

export function roleLabel(slug: string, name: string): string {
  return ROLE_LABELS[slug] ?? name;
}
