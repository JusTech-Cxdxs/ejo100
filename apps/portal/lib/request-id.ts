import { headers } from 'next/headers';

/**
 * The id middleware.ts gave this request (also sent back to the browser as
 * the x-request-id response header). Put it in log lines so a support
 * request quoting the id finds the matching server log. Server-only.
 */
export async function getRequestId(): Promise<string | null> {
  try {
    return (await headers()).get('x-request-id');
  } catch {
    // Outside a request (scheduled jobs, build time) there is none.
    return null;
  }
}
