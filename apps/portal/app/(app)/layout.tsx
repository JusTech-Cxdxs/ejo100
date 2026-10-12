import type { ReactNode } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@ejo/database';
import { auth } from '@/lib/auth';
import { currentAssist, getPrincipal } from '@/lib/authz/server';
import { AssistBanner } from '@/components/AssistBanner';
import { navigationFor } from '@/lib/authz/navigation';
import { AppShell } from '@/components/AppShell';
import { NotificationProvider } from '@/components/NotificationProvider';
import { OfflineNotice } from '@/components/OfflineNotice';
import { portalConfig } from '@/lib/site-config';

/**
 * Signed-in shell. The user's name and role come from Prisma (`fullName`),
 * not Better Auth's session.user, whose `name` field our User model doesn't
 * have. Notifications and the marquee are fetched once here for every page.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    // A cookie the server no longer accepts (session ended): clear it, then sign in —
    // never a /login ↔ /dashboard loop with the middleware.
    redirect('/signed-out');
  }

  // The person and their permissions are read in parallel (one round trip, not two).
  const [userResult, principalResult, assistResult] = await Promise.allSettled([prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      fullName: true,
      isActive: true,
      organisationId: true,
      organisation: { select: { name: true } },
      roles: { select: { role: { select: { name: true } } }, take: 1 },
    },
  }), getPrincipal(), currentAssist()]);
  // Deactivated (or removed) while signed in: out, immediately.
  if (userResult.status === 'rejected') throw userResult.reason;
  const user = userResult.value;
  if (!user?.isActive) redirect('/signed-out?reason=inactive');
  // (A switched-off person never reaches this: their permissions are not loaded.)
  if (principalResult.status === 'rejected') throw principalResult.reason;
  const principal = principalResult.value;
  // Working on a colleague's behalf: the menu is theirs, and a banner says so on every page.
  const assist = assistResult.status === 'fulfilled' ? assistResult.value : null;


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
        banner={assist ? <AssistBanner colleague={assist.subject.name} role={assist.subject.roleLabel} expiresAt={assist.expiresAt.toISOString()} /> : null}
      >
        {children}
      </AppShell>
      <OfflineNotice />
    </NotificationProvider>
  );
}
