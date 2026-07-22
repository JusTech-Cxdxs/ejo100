'use client';

import { createAuthClient } from 'better-auth/react';

/** Client-side auth hooks/actions for the portal's login page and any
 * component that needs the current session (useSession, signIn, signOut). */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3001',
});

export const { signIn, signOut, useSession } = authClient;
