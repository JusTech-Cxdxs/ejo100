import { prisma, setAuditActor } from '@ejo/database';

/**
 * Customer self-service audit trail (cross-workstream contract 3):
 * AuditLog rows with organisationId = the customer's organisation,
 * entityType 'Customer', entityId = the customer's id, action
 * 'customer.<verb>', userId null (a customer is not a staff user) and
 * metadata.actor 'customer'. Edits carry `changes: { field: { from, to } }`.
 * Never passwords, tokens or hashes.
 */
export type CustomerAuditVerb =
  | 'signed_in'
  | 'profile_updated'
  | 'address_added'
  | 'address_updated'
  | 'address_removed'
  | 'password_changed'
  | 'password_reset_requested'
  | 'password_reset'
  | 'preferences_updated';

export type FieldChanges = Record<string, { from: unknown; to: unknown }>;

export async function writeCustomerAudit(o: {
  customerId: string;
  organisationId: string;
  verb: CustomerAuditVerb;
  changes?: FieldChanges;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organisationId: o.organisationId,
        userId: null,
        action: `customer.${o.verb}`,
        entityType: 'Customer',
        entityId: o.customerId,
        metadata: JSON.parse(JSON.stringify({ actor: 'customer', ...(o.details ?? {}), ...(o.changes ? { changes: o.changes } : {}) })),
        ipAddress: o.ipAddress ?? null,
      },
    });
  } catch (err) {
    // An audit failure never breaks the customer's own action; it is logged.
    // eslint-disable-next-line no-console
    console.error('Customer audit write failed', o.verb, err instanceof Error ? err.message : err);
  }
}

/** Only the fields that really changed, as { field: { from, to } }. */
export function diffFields<T extends Record<string, unknown>>(before: T, after: Partial<T>): FieldChanges {
  const out: FieldChanges = {};
  for (const key of Object.keys(after)) {
    const a = (before as Record<string, unknown>)[key] ?? null;
    const b = (after as Record<string, unknown>)[key] ?? null;
    if (a !== b) out[key] = { from: a, to: b };
  }
  return out;
}

/** Stamps the shared data journal (packages/database audit-journal) for this
 * request: no staff user, source 'customer-portal', the customer's organisation. */
export function markCustomerActor(organisationId: string): void {
  try { setAuditActor(null, 'customer-portal', organisationId); } catch { /* never blocks */ }
}

/** First address in X-Forwarded-For (Vercel / proxies), else X-Real-IP. */
export function clientIp(h: Headers): string | null {
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim().slice(0, 64) || null;
  return h.get('x-real-ip')?.slice(0, 64) ?? null;
}
