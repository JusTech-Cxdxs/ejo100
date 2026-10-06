import { cache } from 'react';
import { prisma } from '@ejo/database';
import { requireUser } from '@/lib/actions/workshop';
import { getWorkshopBranchId } from '@/lib/workshop-core';

/**
 * "Organisation — Business unit — State — Branch — Area", read from the
 * signed-in person's own branch (or the workshop branch), never typed into
 * a page — so every organisation on the platform sees its own names.
 * Loaded once per request however many times a page shows it.
 */
const loadTrail = cache(async (): Promise<{ org: string; unit: string; state: string; branch: string }> => {
  try {
    const user = await requireUser();
    const me = await prisma.user.findUnique({ where: { id: user.id }, select: { branchId: true } });
    const branchId = me?.branchId ?? (await getWorkshopBranchId());
    const b = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { name: true, city: { select: { state: { select: { name: true } } } }, businessUnit: { select: { name: true, organisation: { select: { name: true } } } } },
    });
    return { org: b?.businessUnit.organisation.name ?? '', unit: b?.businessUnit.name ?? '', state: b?.city.state.name ?? '', branch: b?.name ?? '' };
  } catch {
    return { org: '', unit: '', state: '', branch: '' };
  }
});

export async function OrgTrail({ area, upTo = 'area' }: { area?: string; upTo?: 'unit' | 'area' }) {
  const t = await loadTrail();
  const parts = upTo === 'unit' ? [t.org, t.unit] : [t.org, t.unit, t.state, t.branch, area];
  return <>{parts.filter(Boolean).join(' — ')}</>;
}
