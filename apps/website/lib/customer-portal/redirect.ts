export const DASHBOARD_PATH = '/customer-portal/dashboard';

/**
 * Where to go after signing in. Only ever a page inside this site's own
 * customer dashboard — never another site ("//evil", "/\\evil", "https://…")
 * and never anywhere outside the dashboard.
 */
export function safeRedirect(requested: string | null | undefined): string {
  const r = (requested ?? '').trim();
  if (!r || r.length > 300) return DASHBOARD_PATH;
  if (!/^\/(?![/\\])/.test(r)) return DASHBOARD_PATH;
  if (/[\\\u0000-\u001f]/.test(r)) return DASHBOARD_PATH;
  if (r !== DASHBOARD_PATH && !r.startsWith(`${DASHBOARD_PATH}/`) && !r.startsWith(`${DASHBOARD_PATH}?`)) return DASHBOARD_PATH;
  return r;
}
