import { PERMISSIONS, scopeFor, type PermissionKey, type Principal } from '../authz/catalogue';
import { pluralize } from '../utils/pluralize';

/**
 * Assisted sessions: the rules, with no database and no request, so they can
 * be tested on their own. A branch assistant may work on a colleague's behalf
 * only when the colleague's own access holds nothing sensitive, and only with
 * the colleague's password typed as consent.
 */

export const ASSIST_DEFAULT_MINUTES = 30;
export const ASSIST_MIN_MINUTES = 5;
export const ASSIST_MAX_MINUTES = 120;
/** Wrong passwords allowed per assistant and colleague in the window below. */
export const ASSIST_MAX_FAILED_ATTEMPTS = 5;
export const ASSIST_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

/** Permissions that keep a person out of assisted sessions: approvals, money,
 * prices, administration, the audit trail, analytics, broadcasts, incident
 * handling and assisting itself. Someone holding any of these signs in
 * themselves. */
const SENSITIVE_EXACT = new Set<string>([
  'workshop.payment.record',
  'workshop.refund.record',
  'audit.view',
  'notifications.broadcast.send',
  'security.incident.manage',
  'support.assist',
  // Sets selling prices and stock levels, which is money by another name.
  'store.parts.manage',
]);
const SENSITIVE_PREFIXES = ['admin.', 'analytics.', 'procurement.epr.'];

export function isSensitivePermission(key: string): boolean {
  if (SENSITIVE_EXACT.has(key)) return true;
  if (/approve/.test(key)) return true;
  return SENSITIVE_PREFIXES.some((p) => key.startsWith(p));
}

/** Every permission the person holds, from their roles and added grants. */
export function effectivePermissions(p: Principal): PermissionKey[] {
  return (Object.keys(PERMISSIONS) as PermissionKey[]).filter((k) => scopeFor(p, k) !== null);
}

/** The sensitive permissions a person holds (empty means they can be assisted). */
export function sensitivePermissionsOf(p: Principal): PermissionKey[] {
  if (p.isSuperAdmin) return ['admin.organisation.manage'];
  return effectivePermissions(p).filter(isSensitivePermission);
}

export type AssistParty = Principal & { isActive: boolean };

export type AssistRefusal = { code: 'ASSISTANT_INACTIVE' | 'PLATFORM_TEAM' | 'NOT_ALLOWED' | 'NO_BRANCH' | 'SELF' | 'COLLEAGUE_INACTIVE' | 'OUT_OF_REACH' | 'SENSITIVE'; message: string };

/**
 * Whether `assistant` may work on behalf of `colleague` right now, or why not.
 * Checked when the session starts and again on every request while it lasts.
 */
export function assistRefusal(assistant: AssistParty, colleague: AssistParty): AssistRefusal | null {
  if (!assistant.isActive) return { code: 'ASSISTANT_INACTIVE', message: 'Your account is switched off.' };
  if (assistant.isSuperAdmin) return { code: 'PLATFORM_TEAM', message: 'The platform team does not use assisted sessions.' };
  const scope = scopeFor(assistant, 'support.assist');
  if (!scope) return { code: 'NOT_ALLOWED', message: 'Only a Branch Assistant can help colleagues this way.' };
  if (colleague.userId === assistant.userId) return { code: 'SELF', message: 'You cannot start an assisted session for yourself.' };
  // Same organisation always. Branch-scoped assistants (the normal case) also
  // need to belong to a branch, and the colleague to the same one.
  if (!assistant.organisationId || colleague.organisationId !== assistant.organisationId) return { code: 'OUT_OF_REACH', message: 'This colleague is not someone you can assist.' };
  if (scope !== 'ALL') {
    if (!assistant.branchId) return { code: 'NO_BRANCH', message: 'Your account is not placed in a branch yet. Ask your administrator.' };
    if (colleague.branchId !== assistant.branchId) return { code: 'OUT_OF_REACH', message: 'This colleague is not someone you can assist.' };
  }
  if (!colleague.isActive) return { code: 'COLLEAGUE_INACTIVE', message: 'This colleague\'s account is switched off.' };
  if (colleague.isSuperAdmin || sensitivePermissionsOf(colleague).length > 0) {
    return { code: 'SENSITIVE', message: 'This colleague has approval, money or administration access, so they must sign in themselves.' };
  }
  return null;
}

/** How long a session lasts, from ASSIST_SESSION_MINUTES (default 30, between 5 and 120). */
export function assistMinutes(raw: string | undefined | null): number {
  const n = Math.round(Number(raw));
  if (!raw || !Number.isFinite(n) || n <= 0) return ASSIST_DEFAULT_MINUTES;
  return Math.min(ASSIST_MAX_MINUTES, Math.max(ASSIST_MIN_MINUTES, n));
}

// ── Wording ─────────────────────────────────────────────────────────────

/** "Musa Ibrahim (assisted by Ada Okafor)" when an audit entry was recorded during an assisted session. */
export function actorLabel<T extends string | null>(name: T, metadata: unknown): T | string {
  const by = assistedByOf(metadata);
  if (!by) return name;
  return `${name ?? 'Someone'} (assisted by ${by.name})`;
}

export function assistedByOf(metadata: unknown): { id: string; name: string } | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const by = (metadata as { assistedBy?: unknown }).assistedBy;
  if (!by || typeof by !== 'object') return null;
  const { id, name } = by as { id?: unknown; name?: unknown };
  return typeof id === 'string' && typeof name === 'string' && name ? { id, name } : null;
}

/** The colleague's notification when a session ends. */
export function assistSummary(assistantName: string, from: string, to: string, actions: number): string {
  return `${assistantName} helped you with your work from ${from} to ${to} — ${actions === 0 ? 'no actions recorded' : `${pluralize(actions, 'action')} recorded`}.`;
}

/** How a session ended, in words for the history list. */
export const END_REASON_LABEL: Record<string, string> = {
  ended_by_assistant: 'Ended by the assistant',
  expired: 'Time ran out',
  assistant_signed_out: 'The assistant signed out',
  colleague_switched_off: 'The colleague\'s account was switched off',
  no_longer_assistable: 'The colleague\'s access changed',
  assistant_not_allowed: 'The assistant\'s access changed',
  replaced: 'A new session was started',
};

export function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((+b - +a) / 60000));
}
