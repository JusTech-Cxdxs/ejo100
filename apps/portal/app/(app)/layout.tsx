import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@ejo/database';
import { auth } from '@/lib/auth';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { NavigationLoadingProvider } from '@/components/NavigationLoadingProvider';

/**
 * Fetches the logged-in user's real name/role server-side (via Prisma
 * directly, not Better Auth's session.user) and passes it to Topbar,
 * which previously showed a hardcoded "John Doe / Administrator".
 *
 * Deliberately queries Prisma for `fullName` rather than trusting Better
 * Auth's session.user.name: this project's User model has `fullName`,
 * not `name` — the same field-naming gap already found once this project
 * (Account.password) — so relying on Better Auth's own session shape
 * here would risk showing blank/wrong data. Querying Prisma directly
 * sidesteps that question entirely rather than assuming an answer to it.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect('/login');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      fullName: true,
      roles: { select: { role: { select: { name: true } } }, take: 1 },
    },
  });

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar
          userName={user?.fullName ?? 'Unknown user'}
          roleName={user?.roles[0]?.role.name ?? 'No role assigned'}
        />
        <main className="flex-1 bg-[var(--ejo-bg)] flex">
          <NavigationLoadingProvider>{children}</NavigationLoadingProvider>
        </main>
      </div>
    </div>
  );
}
