'use client';

import { createAuthClient } from 'better-auth/react';

/** Client-side auth hooks/actions for the portal's login page and any
 * component that needs the current session (useSession, signIn, signOut). */
export const authClient = createAuthClient({
  // Same origin as the page in the browser, so a custom domain needs no setting here.
  baseURL: typeof window === 'undefined' ? process.env.NEXT_PUBLIC_PORTAL_URL || undefined : window.location.origin,
});

export const { signIn, signOut, useSession } = authClient;
