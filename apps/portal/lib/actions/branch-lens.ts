'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@ejo/database';
import { getPrincipal, inMyOrganisation, LENS_COOKIE } from '@/lib/authz/server';
import { hasBranchLens } from '@/lib/authz/catalogue';

export type LensOptions = { current: string | null; branches: { id: string; name: string; city: string | null }[] } | null;

/**
 * The branch lens for headquarters roles (an organisation-wide view in any
 * area): every module's lists and analytics show All branches or one branch.
 * Only the person's own organisation's branches; a viewing preference, so it
 * narrows what is shown and never what anyone may do.
 */
export async function getBranchLensOptions(): Promise<LensOptions> {
  const p = await getPrincipal();
  if (!hasBranchLens(p) || !p.organisationId) return null;
  const branches = await prisma.branch.findMany({
    where: { businessUnit: { organisationId: p.organisationId }, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, city: { select: { name: true } } },
    take: 100,
  });
  return { current: p.lensBranchId ?? null, branches: branches.map((b) => ({ id: b.id, name: b.name, city: b.city?.name ?? null })) };
}

/** Look at one branch (its id) or at all of them (''). Refuses anything outside the person's organisation. */
export async function setBranchLens(branchId: string): Promise<{ ok: true } | { error: string }> {
  const p = await getPrincipal();
  if (!hasBranchLens(p)) return { error: 'Your view is already your own branch.' };
  const id = String(branchId ?? '');
  const jar = await cookies();
  if (!id) {
    jar.delete(LENS_COOKIE);
  } else {
    // The branch must be one of the person's own organisation (the platform team: any).
    const b = /^[A-Za-z0-9_-]{1,64}$/.test(id) ? await prisma.branch.findUnique({ where: { id }, select: { isActive: true, businessUnit: { select: { organisationId: true } } } }) : null;
    if (!b || !b.isActive || !(await inMyOrganisation(b.businessUnit.organisationId))) return { error: 'Choose a branch of your organisation.' };
    jar.set(LENS_COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 });
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}
