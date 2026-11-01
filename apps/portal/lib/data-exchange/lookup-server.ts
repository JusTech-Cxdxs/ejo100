/**
 * Data Exchange — finding existing customers for a block of rows (server
 * only, never a 'use server' file). By SAP / old-system number within the
 * organisation, by email (unique on the platform), by phone (last ten digits).
 */
import { prisma, type Prisma } from '@ejo/database';

/** Existing customers of the organisation these keys point at (SAP number, email, phone). */
export async function findCustomers(db: Prisma.TransactionClient | typeof prisma, organisationId: string, source: string, keys: { ext: string[]; email: string[]; phone: string[] }) {
  const [byExt, byEmail, byPhone] = await Promise.all([
    keys.ext.length ? db.customer.findMany({ where: { organisationId, externalSource: source, externalId: { in: keys.ext } }, select: { id: true, externalId: true } }) : [],
    keys.email.length ? db.customer.findMany({ where: { email: { in: keys.email } }, select: { id: true, email: true, organisationId: true } }) : [],
    keys.phone.length
      ? db.$queryRaw<{ id: string; k: string }[]>`
          SELECT id, right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) AS k FROM customers
           WHERE "organisationId" = ${organisationId}
             AND right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = ANY(${keys.phone.map((p) => p.slice(-10))}::text[])`
      : [],
  ]);
  return {
    ext: new Map(byExt.map((c) => [String(c.externalId).toUpperCase(), c.id])),
    email: new Map(byEmail.map((c) => [String(c.email), { id: c.id, sameOrg: c.organisationId === organisationId }])),
    phone: new Map(byPhone.map((c) => [c.k, c.id])),
  };
}
