import { toNextJsHandler } from 'better-auth/next-js';
import { customerAuth } from '@/lib/auth-customer';

/** Mounts the customer auth instance's endpoints at /api/auth/* on the
 * website app. Kept entirely separate from the portal's /api/auth/*. */
export const { GET, POST } = toNextJsHandler(customerAuth);
