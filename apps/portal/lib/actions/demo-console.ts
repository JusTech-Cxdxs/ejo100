'use server';

/**
 * The platform team's demo console (IT control room → Demo organisation):
 * which organisation is the demo, how much demo is in it, and one button to
 * load it again as of now (people → plant → workshop) or take the demo
 * records out. The same code as `npm run demo:reset`.
 *
 * Only the platform team (the Master Administrator) — never an organisation's
 * own administrators — typed words confirm every change, never during an
 * assisted session, and every step is audited. Only an organisation marked
 * as a demo is ever loaded; a person's own records are never touched (the
 * demo removes exactly what it made, listed in demo_records).
 */
import { revalidatePath } from 'next/cache';
import { authorize, getPrincipal, refuse, refuseDuringAssist } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { prisma } from '@ejo/database';
import { describeDemoPeople, disableStrayDemoPeople, loadDemoPeople, markDemoOrganisation } from '@/lib/demo/people-load';
import { loadPlantDemo, removePlantDemo } from '@/lib/plant/demo/load';
import { loadWorkshopDemo, removeWorkshopDemo } from '@/lib/workshop/demo/load';
import { DEMO_SOURCE } from '@/lib/workshop/demo/plan';
import { PULSE_MODEL, pulseEnabled } from '@/lib/demo/pulse-core';

type Done<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const ONLY = 'The demo organisation is the platform team’s.';

export type DemoConsoleOrg = { id: string; name: string; slug: string; isDemo: boolean; records: number; plantVehicles: number; people: number; signIns: number; loadedAt: Date | null; lastPulseDay: string | null };
export type DemoConsoleState = { orgs: DemoConsoleOrg[]; passwordSet: boolean; pulseOn: boolean };

/** The platform team only: authorize, then the Master Administrator check. */
async function platformTeam(where: string): Promise<string> {
  await authorize('admin.organisation.manage', undefined, where, ONLY);
  const p = await getPrincipal();
  if (!p.isSuperAdmin) return refuse('admin.organisation.manage', where, ONLY);
  return p.userId;
}

/** An organisation by id — for the platform team, any organisation (the console is cross-organisation by design; platformTeam() came first). */
async function platformOrg(id: string) {
  return prisma.organisation.findUnique({ where: { id: String(id ?? '') }, select: { id: true, slug: true, name: true, isDemo: true } });
}

/** Every organisation, with how much demo each holds. */
export async function getDemoConsoleState(): Promise<DemoConsoleState> {
  await platformTeam('getDemoConsoleState');
  const orgs = await prisma.organisation.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, name: true, slug: true, isDemo: true }, take: 50 });
  const out: DemoConsoleOrg[] = [];
  for (const o of orgs) {
    const [records, plantVehicles, people, signIns, loaded, pulse] = await Promise.all([
      prisma.demoRecord.count({ where: { organisationId: o.id, model: { not: PULSE_MODEL } } }),
      prisma.plantVehicle.count({ where: { organisationId: o.id, externalSource: DEMO_SOURCE } }),
      prisma.user.count({ where: { organisationId: o.id, email: { endsWith: '@demo.kewalram.local' }, isActive: true } }),
      prisma.account.count({ where: { providerId: 'credential', user: { organisationId: o.id, email: { endsWith: '@demo.kewalram.local' } } } }),
      prisma.auditLog.findFirst({ where: { organisationId: o.id, action: { in: ['demo.workshop_loaded', 'demo.refreshed'] } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      prisma.demoRecord.findFirst({ where: { organisationId: o.id, model: PULSE_MODEL }, orderBy: { recordId: 'desc' }, select: { recordId: true } }),
    ]);
    out.push({ ...o, records, plantVehicles, people, signIns, loadedAt: loaded?.createdAt ?? null, lastPulseDay: pulse?.recordId.split(':').pop() ?? null });
  }
  return { orgs: out, passwordSet: (process.env.DEMO_STAFF_PASSWORD ?? '').trim().length >= 8, pulseOn: pulseEnabled() };
}

/** Marks (or unmarks) an organisation as the demo. Unmarking switches its demo people off on the spot. Typed: the organisation's slug. */
export async function setDemoOrganisation(organisationId: string, isDemo: boolean, confirm: string): Promise<Done<{ summary: string }>> {
  const userId = await platformTeam('setDemoOrganisation');
  try { await refuseDuringAssist('setDemoOrganisation'); } catch (e) { return fail((e as Error).message); }
  const org = await platformOrg(organisationId);
  if (!org) return fail('No such organisation.');
  if (String(confirm ?? '').trim().toLowerCase() !== org.slug.toLowerCase()) return fail(`Type the organisation’s short name, “${org.slug}”, to go ahead.`);
  if (org.isDemo === isDemo) return { ok: true, summary: `${org.name} is already ${isDemo ? '' : 'not '}the demo.` };
  await markDemoOrganisation(prisma, org.id, isDemo);
  const switchedOff = isDemo ? 0 : await disableStrayDemoPeople(prisma);
  await writeAuditLog({ userId, action: isDemo ? 'demo.organisation_marked' : 'demo.organisation_unmarked', entityType: 'Organisation', entityId: org.id, organisationId: org.id, metadata: { organisation: org.name, demoPeopleSwitchedOff: switchedOff } });
  revalidatePath('/it');
  return { ok: true, summary: isDemo ? `${org.name} is now the demo organisation. Load the demo to fill it.` : `${org.name} is no longer a demo: ${switchedOff} demo sign-ins switched off. Its demo records stay until you remove them.` };
}

/** Loads the whole demo again as of now: the people (when the password is set), the plant's six weeks, the workshop's six months. */
export async function refreshDemoNow(organisationId: string, confirm: string): Promise<Done<{ summary: string }>> {
  const userId = await platformTeam('refreshDemoNow');
  try { await refuseDuringAssist('refreshDemoNow'); } catch (e) { return fail((e as Error).message); }
  if (String(confirm ?? '').trim().toLowerCase() !== 'refresh the demo') return fail('Type “refresh the demo” to go ahead: the demo records are replaced as of now (nobody’s own records are touched).');
  const org = await platformOrg(organisationId);
  if (!org) return fail('No such organisation.');
  if (!org.isDemo) return fail(`${org.name} is not marked as the demo; mark it first.`);
  const started = Date.now();
  let summary: string;
  try {
    const people = await loadDemoPeople(prisma, org.id, process.env, userId);
    const plant = await loadPlantDemo(org.id, new Date());
    const workshop = await loadWorkshopDemo(org.id, new Date());
    const seconds = Math.round((Date.now() - started) / 1000);
    summary = `Loaded as of now in ${seconds}s: ${plant.made.vehicles} plant vehicles and ${plant.made.kits} kits; ${workshop.figures.jobCards} job cards, ${workshop.figures.services} services, ${workshop.figures.customers} customers, ${workshop.figures.claims} warranty claims. ${people.skipped ? 'Sign-ins: not changed (DEMO_STAFF_PASSWORD is not set).' : 'Sign-ins in place.'}`;
    await writeAuditLog({ userId, action: 'demo.refreshed', entityType: 'Organisation', entityId: org.id, organisationId: org.id, metadata: { seconds, people: describeDemoPeople(people), plant: plant.made, workshop: workshop.figures, removedWorkshopRecords: workshop.removed } });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'The demo could not be loaded.');
  }
  revalidatePath('/', 'layout');
  return { ok: true, summary };
}

/** Takes the demo records out (workshop and plant). The demo people stay — unmark the organisation to switch them off. */
export async function removeDemoNow(organisationId: string, confirm: string): Promise<Done<{ summary: string }>> {
  const userId = await platformTeam('removeDemoNow');
  try { await refuseDuringAssist('removeDemoNow'); } catch (e) { return fail((e as Error).message); }
  if (String(confirm ?? '').trim().toLowerCase() !== 'remove the demo') return fail('Type “remove the demo” to go ahead.');
  const org = await platformOrg(organisationId);
  if (!org) return fail('No such organisation.');
  if (!org.isDemo) return fail(`${org.name} is not marked as the demo; nothing of it is demo records.`);
  const workshop = await removeWorkshopDemo(org.id);
  const plant = await removePlantDemo(org.id);
  await writeAuditLog({ userId, action: 'demo.removed', entityType: 'Organisation', entityId: org.id, organisationId: org.id, metadata: { workshopRecords: workshop, plant } });
  revalidatePath('/', 'layout');
  return { ok: true, summary: `Removed ${workshop} workshop demo records and ${plant.vehicles} plant vehicles with ${plant.shipments} shipments. Nobody’s own records were touched.` };
}
