/**
 * Instant "something changed" pings over Supabase Realtime (broadcast).
 *
 * - Carries NO business data — only a timestamp. Each browser then fetches
 *   its OWN notifications through the normal signed-in, permission-checked
 *   server code, so the channel can never leak anything.
 * - Uses only the public Supabase URL + anon key (designed to be public);
 *   no secret key is involved.
 * - Optional: if the two settings are missing it does nothing, and browsers
 *   keep using the 5-second check. A failure never affects the action that
 *   triggered it (short timeout, errors swallowed).
 */
export const REALTIME_TOPIC = 'ejo-changes';

let lastSent = 0;

export async function announceChange(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  // Many actions write several audit entries at once — one ping is enough.
  const now = Date.now();
  if (now - lastSent < 750) return;
  lastSent = now;
  try {
    await fetch(`${url.replace(/\/$/, '')}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages: [{ topic: REALTIME_TOPIC, event: 'changed', payload: { at: now } }] }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Never affects the action; browsers still have the regular check.
  }
}
