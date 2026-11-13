import type { ReactNode } from 'react';
import { areaNotAtMyBranch, guardAnyPage } from '@/lib/authz/server';
import { AreaNotHere } from '@/components/AreaNotHere';

/**
 * Server-side guard for /workshop — pasted links included. (Workshop staff, Finance, Store, Warranty, management.)
 * Someone whose own branch has no such area (the menu does not offer it) is
 * told so in place of the page.
 */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardAnyPage(['workshop.view'], '/workshop');
  const elsewhere = await areaNotAtMyBranch('workshop');
  if (elsewhere) return <AreaNotHere area="workshop" {...elsewhere} />;
  return children;
}
