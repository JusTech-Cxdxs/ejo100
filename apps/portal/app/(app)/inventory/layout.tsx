import type { ReactNode } from 'react';
import { areaNotAtMyBranch, guardAnyPage } from '@/lib/authz/server';
import { AreaNotHere } from '@/components/AreaNotHere';

/**
 * Server-side guard for /inventory — pasted links included. (Store, Workshop supervisors and technicians, Finance, management.)
 * Someone whose own branch has no such area (the menu does not offer it) is
 * told so in place of the page.
 */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardAnyPage(['store.view'], '/inventory');
  const elsewhere = await areaNotAtMyBranch('inventory');
  if (elsewhere) return <AreaNotHere area="inventory" {...elsewhere} />;
  return children;
}
