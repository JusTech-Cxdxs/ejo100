import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth';

/**
 * Mounts every Better Auth endpoint (sign-in, sign-out, session, password
 * reset, email verification, etc.) at /api/auth/*. Nothing else in the
 * portal should implement these by hand — always go through this handler.
 */
export const { GET, POST } = toNextJsHandler(auth);
