'use client';

import { createAuthClient } from 'better-auth/react';

/** Client-side hooks/actions for the /customer-portal login page. */
export const customerAuthClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'http://localhost:3000',
});

export const { signIn: customerSignIn, signOut: customerSignOut, useSession: useCustomerSession } =
  customerAuthClient;
