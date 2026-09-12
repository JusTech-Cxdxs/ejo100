import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@ejo/database';
import { auth } from '@/lib/auth';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { Marquee } from '@/components/Marquee';
import { NavigationLoadingProvider } from '@/components/NavigationLoadingProvider';
import { getDashboardNotifications, getMarqueeItems } from '@/lib/actions/dashboard';

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
 *
 * Notifications and the marquee's own real items are both fetched here,
 * once, at the real top of the authenticated layout — every page
 * underneath genuinely shares the same real header, not a per-page
 * re-fetch of the same data.
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
      organisationId: true,
      roles: { select: { role: { select: { name: true } } }, take: 1 },
    },
  });

  const [notifications, marqueeItems] = await Promise.all([
    getDashboardNotifications(),
    user?.organisationId ? getMarqueeItems(user.organisationId) : Promise.resolve([]),
  ]);

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar
          userName={user?.fullName ?? 'Unknown user'}
          roleName={user?.roles[0]?.role.name ?? 'No role assigned'}
          notifications={notifications}
        />
        <Marquee items={marqueeItems} />
        <main className="flex-1 bg-[var(--ejo-bg)] flex">
          <NavigationLoadingProvider>{children}</NavigationLoadingProvider>
        </main>
      </div>
    </div>
  );
}
