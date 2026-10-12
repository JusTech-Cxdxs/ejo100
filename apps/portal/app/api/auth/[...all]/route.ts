import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth';

/** Mounts the Better Auth endpoints (sign-in, sign-out, session, password reset, verification) at /api/auth/*. */
export const { GET, POST } = toNextJsHandler(auth);
