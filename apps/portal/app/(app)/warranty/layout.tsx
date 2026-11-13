import type { ReactNode } from 'react';
import { areaNotAtMyBranch, guardAnyPage } from '@/lib/authz/server';
import { AreaNotHere } from '@/components/AreaNotHere';

/**
 * Server-side guard for /warranty — pasted links included. (Warranty staff, Manager, administrators.)
 * Someone whose own branch has no such area (the menu does not offer it) is
 * told so in place of the page.
 */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardAnyPage(['warranty.view'], '/warranty');
  const elsewhere = await areaNotAtMyBranch('warranty');
  if (elsewhere) return <AreaNotHere area="warranty" {...elsewhere} />;
  return children;
}
