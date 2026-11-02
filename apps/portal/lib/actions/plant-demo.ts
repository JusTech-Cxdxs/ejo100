'use server';

/**
 * The plant demo from inside EJO: an administrator loads six weeks of
 * invented plant records into their organisation's assembly plant (or takes
 * them out again). The same plan as `npm run demo:reset`; the organisation
 * is always the person's own (myOrganisationId), the action is audited, and
 * it is never available during an assisted session.
 */
import { revalidatePath } from 'next/cache';
import { authorize, getPrincipal, myOrganisationId, refuseDuringAssist } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { prisma } from '@ejo/database';
import { DEMO_SOURCE, loadPlantDemo, removePlantDemo, type DemoLoadResult } from '@/lib/plant/demo/load';

export const DEMO_CONFIRM_WORDS = 'load the demo';
type Done<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const ONLY = 'Loading the plant demo is for administrators.';

/** How much demo is in the organisation's plant right now (for the card). */
export async function getPlantDemoState(): Promise<{ vehicles: number; shipments: number; loadedAt: Date | null }> {
  await authorize('plant.view', undefined, 'getPlantDemoState', 'The plant is for the plant team.');
  const organisationId = await myOrganisationId();
  if (!organisationId) return { vehicles: 0, shipments: 0, loadedAt: null };
  const [vehicles, shipments, last] = await Promise.all([
    prisma.plantVehicle.count({ where: { organisationId, externalSource: DEMO_SOURCE } }),
    prisma.plantShipment.count({ where: { organisationId, externalSource: DEMO_SOURCE } }),
    prisma.auditLog.findFirst({ where: { organisationId, action: 'demo.plant_loaded' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);
  return { vehicles, shipments, loadedAt: last?.createdAt ?? null };
}

/** Loads the demo as of now, replacing the previous demo records. The words confirm it. */
export async function loadPlantDemoNow(confirm: string): Promise<Done<{ summary: string; result: DemoLoadResult }>> {
  await authorize('admin.structure.manage', undefined, 'loadPlantDemoNow', ONLY);
  try { await refuseDuringAssist('loadPlantDemoNow'); } catch (e) { return fail((e as Error).message); }
  if (String(confirm ?? '').trim().toLowerCase() !== DEMO_CONFIRM_WORDS) return fail(`Type “${DEMO_CONFIRM_WORDS}” to go ahead: the previous demo records are replaced.`);
  const me = await getPrincipal();
  const organisationId = await myOrganisationId();
  if (!organisationId) return fail('You are not in an organisation.');
  let result: DemoLoadResult;
  try { result = await loadPlantDemo(organisationId, new Date()); } catch (e) { return fail(e instanceof Error ? e.message : 'The demo could not be loaded.'); }
  await writeAuditLog({ userId: me.userId, action: 'demo.plant_loaded', entityType: 'Branch', entityId: result.plantId, organisationId, metadata: { removed: result.removed, made: result.made, byStage: result.figures.byStage } });
  revalidatePath('/', 'layout');
  const m = result.made;
  return { ok: true, result, summary: `Loaded: ${m.shipments} shipments, ${m.kits} kits, ${m.vehicles} vehicles (${Object.entries(result.figures.byStage).map(([s, n]) => `${n} ${s.toLowerCase()}`).join(', ')}), ${m.defects} defects, ${m.audits} QA audits, ${m.pdis} PDIs. First-time-through ${result.figures.ftt}%.` };
}

/** Takes the demo records out (only records marked EJO-DEMO). */
export async function removePlantDemoNow(confirm: string): Promise<Done<{ summary: string }>> {
  await authorize('admin.structure.manage', undefined, 'removePlantDemoNow', ONLY);
  try { await refuseDuringAssist('removePlantDemoNow'); } catch (e) { return fail((e as Error).message); }
  if (String(confirm ?? '').trim().toLowerCase() !== 'remove the demo') return fail('Type “remove the demo” to go ahead.');
  const me = await getPrincipal();
  const organisationId = await myOrganisationId();
  if (!organisationId) return fail('You are not in an organisation.');
  const r = await removePlantDemo(organisationId);
  await writeAuditLog({ userId: me.userId, action: 'demo.plant_removed', entityType: 'Organisation', entityId: organisationId, organisationId, metadata: r });
  revalidatePath('/', 'layout');
  return { ok: true, summary: `Removed ${r.vehicles} demo vehicles and ${r.shipments} demo shipments, with their kits, stations, defects, audits and PDIs.` };
}
