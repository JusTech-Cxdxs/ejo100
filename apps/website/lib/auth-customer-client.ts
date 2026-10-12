'use client';

import { createAuthClient } from 'better-auth/react';

/** Client-side hooks/actions for the /customer-portal login page. */
export const customerAuthClient = createAuthClient({
  // Same origin as the page in the browser, so a custom domain needs no setting here.
  baseURL: typeof window === 'undefined' ? process.env.NEXT_PUBLIC_WEBSITE_URL || undefined : window.location.origin,
});

export const { signIn: customerSignIn, signOut: customerSignOut, useSession: useCustomerSession } =
  customerAuthClient;
