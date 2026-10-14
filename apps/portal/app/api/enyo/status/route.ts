import { requireUser } from '@/lib/actions/workshop';
import { myOrganisationId } from '@/lib/authz/server';
import { enyoReady } from '@/lib/enyo/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'private, no-store, max-age=0' };

/**
 * GET /api/enyo/status — whether the staff assistant can answer right now,
 * for the panel: { ready, reason?, displayName, provider? }. Signed-in only.
 * Never names the model server's address or key.
 */
export async function GET() {
  try {
    await requireUser();
  } catch {
    return Response.json({ error: 'Please sign in again.' }, { status: 401, headers: NO_STORE });
  }
  try {
    const ready = await enyoReady(await myOrganisationId(), 'staffAssistant');
    const displayName = ready.settings.displayName || 'Enyo';
    return Response.json(ready.ready ? { ready: true, displayName, provider: ready.config.providerLabel } : { ready: false, reason: ready.reason, displayName }, { headers: NO_STORE });
  } catch {
    return Response.json({ ready: false, reason: 'switched_off', displayName: 'Enyo' }, { headers: NO_STORE });
  }
}
