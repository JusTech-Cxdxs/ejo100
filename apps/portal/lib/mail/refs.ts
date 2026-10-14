import { prisma } from '@ejo/database';
import { allows, orgWhere } from '@/lib/authz/server';
import { globalSearch } from '@/lib/actions/search';
import { normalisePlate, type MailRef } from './brief-core';

/**
 * References found in an email → links, worked out for the person reading,
 * with their own permissions and reach (the same rules as the header search
 * and the record pages). Anything they may not open is simply not linked.
 * Server-only; needs the signed-in session.
 */
export type ResolvedRef = { kind: MailRef['kind']; value: string; label: string; href: string };

export async function resolveMailRefs(refs: MailRef[]): Promise<ResolvedRef[]> {
  const list = refs.slice(0, 8);
  if (!list.length) return [];
  const [canWorkshop, canCrm] = await Promise.all([allows('workshop.view'), allows('crm.view')]);
  const fence = await orgWhere();
  const out = await Promise.all(list.map(async (r): Promise<ResolvedRef | null> => {
    try {
      if (r.kind === 'ref') {
        // A complete reference number asks only its own table, within reach.
        const groups = await globalSearch(r.value);
        for (const g of groups) {
          const hit = g.hits.find((h) => h.label === r.value);
          if (hit) return { kind: r.kind, value: r.value, label: `${g.group.replace(/s$/, '')} ${r.value}`, href: hit.href };
        }
        return null;
      }
      if (r.kind === 'plate') {
        if (!canWorkshop) return null;
        const plate = normalisePlate(r.value);
        const v = await prisma.customerVehicle.findFirst({
          where: { customer: fence, OR: [{ plateNumber: { equals: plate, mode: 'insensitive' } }, { plateNumber: { equals: plate.replace(/-/g, ''), mode: 'insensitive' } }] },
          select: { id: true, make: true, model: true, plateNumber: true },
        });
        return v ? { kind: r.kind, value: r.value, label: `${[v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'} — ${v.plateNumber}`, href: `/workshop/vehicles/${v.id}/edit` } : null;
      }
      if (!canCrm && !canWorkshop) return null;
      const c = await prisma.customer.findFirst({ where: { ...fence, email: { equals: r.value, mode: 'insensitive' } }, select: { id: true, fullName: true } });
      return c ? { kind: r.kind, value: r.value, label: `Customer ${c.fullName}`, href: canCrm ? `/crm/customers/${c.id}` : `/workshop/customers?q=${encodeURIComponent(c.fullName)}` } : null;
    } catch {
      return null;
    }
  }));
  return out.filter((x): x is ResolvedRef => Boolean(x));
}
