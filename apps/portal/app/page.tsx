import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

/**
 * The root has no content. It checks the session on the server (not just
 * the cookie) so a signed-in user goes straight to /dashboard.
 */
export default async function RootPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  redirect(session ? '/dashboard' : '/login');
}
