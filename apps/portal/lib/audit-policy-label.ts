/** Warranty-change audit values: older entries stored a policy id, newer
 * ones the policy name. Always show a name — never an internal id. */
export function isPolicyId(v: unknown): v is string {
  return typeof v === 'string' && /^c[a-z0-9]{20,}$/.test(v);
}

export function policyAuditLabel(v: unknown, names: Record<string, string>): string {
  if (v === null || v === undefined || v === '') return 'No warranty';
  if (isPolicyId(v)) return names[v] ?? 'A removed policy';
  return String(v);
}
