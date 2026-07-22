import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

/**
 * Root of the portal has no content of its own. Checks the real session
 * server-side (not just cookie presence) so an already-authenticated
 * employee/admin lands on /dashboard directly instead of bouncing
 * through /login.
 */
export default async function RootPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  redirect(session ? '/dashboard' : '/login');
}
