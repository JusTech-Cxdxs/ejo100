import type { ReactNode } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@ejo/database';
import { auth } from '@/lib/auth';
import { getPrincipal } from '@/lib/authz/server';
import { navigationFor } from '@/lib/authz/navigation';
import { AppShell } from '@/components/AppShell';
import { NotificationProvider } from '@/components/NotificationProvider';
import { portalConfig } from '@/lib/site-config';

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
    // A cookie the server no longer accepts (session ended): clear it, then sign in —
    // never a /login ↔ /dashboard loop with the middleware.
    redirect('/signed-out');
  }

  // The person and their permissions are read in parallel (one round trip, not two).
  const [userResult, principalResult] = await Promise.allSettled([prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      fullName: true,
      isActive: true,
      organisationId: true,
      organisation: { select: { name: true } },
      roles: { select: { role: { select: { name: true } } }, take: 1 },
    },
  }), getPrincipal()]);
  // Deactivated (or removed) while signed in: out, immediately.
  if (userResult.status === 'rejected') throw userResult.reason;
  const user = userResult.value;
  if (!user?.isActive) redirect('/signed-out?reason=inactive');
  // (A switched-off person never reaches this: their permissions are not loaded.)
  if (principalResult.status === 'rejected') throw principalResult.reason;
  const principal = principalResult.value;


  // The menu folded to icons (desktop), remembered on this browser — read here so it never flickers.
  const collapsed = (await cookies()).get('ejo-sidebar')?.value === 'collapsed';

  return (
    <NotificationProvider userId={session?.user?.id ?? null}>
      <AppShell
        items={navigationFor(principal)}
        organisationName={user.organisation?.name ?? portalConfig.companyName}
        userName={user?.fullName ?? 'Unknown user'}
        roleName={user?.roles[0]?.role.name ?? 'No role assigned'}
        initialCollapsed={collapsed}
      >
        {children}
      </AppShell>
    </NotificationProvider>
  );
}
