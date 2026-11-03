/**
 * The demo, once: after the demo people (scripts/demo-people.ts), the
 * production build runs this so a first installation holds the whole demo
 * the moment the deploy finishes — the plant's six weeks (lib/plant/demo)
 * and the workshop's six months (lib/workshop/demo) — with nothing to run
 * anywhere.
 *
 * It loads only into an organisation marked as the demo, and only when that
 * organisation has no demo records yet: a later deploy never wipes what a
 * person did in the demo since. To start again: `npm run demo:reset`, or
 * the platform team's button. DEMO_LOAD=off skips it. Never emails anyone;
 * prints counts, never data.
 */
import { prisma } from '@ejo/database';
import { loadPlantDemo } from '../lib/plant/demo/load';
import { loadWorkshopDemo } from '../lib/workshop/demo/load';
import { DEMO_SOURCE } from '../lib/workshop/demo/plan';

async function main() {
  if ((process.env.DEMO_LOAD ?? '').toLowerCase() === 'off') { console.log('Demo records: skipped (DEMO_LOAD=off).'); return; }
  const orgs = await prisma.organisation.findMany({ where: { isDemo: true }, select: { id: true, name: true, slug: true } });
  if (!orgs.length) { console.log('Demo records: no organisation is marked as a demo; nothing loaded.'); return; }
  for (const org of orgs) {
    const [records, plantRecords, plant] = await Promise.all([
      prisma.demoRecord.count({ where: { organisationId: org.id } }),
      prisma.plantVehicle.count({ where: { organisationId: org.id, externalSource: DEMO_SOURCE } }),
      prisma.branch.findFirst({ where: { businessUnit: { organisationId: org.id }, type: 'ASSEMBLY_PLANT' }, select: { id: true } }),
    ]);
    if (records > 0) { console.log(`Demo records (${org.name}): already loaded (${records} records); left as they are. Reload with npm run demo:reset.`); continue; }
    if (!plant) { console.log(`Demo records (${org.name}): no assembly plant yet; nothing loaded.`); continue; }
    const started = Date.now();
    if (plantRecords === 0) { const p = await loadPlantDemo(org.id, new Date()); console.log(`Plant demo loaded into ${p.plantName}: ${p.made.vehicles} vehicles, ${p.made.kits} kits.`); }
    const w = await loadWorkshopDemo(org.id, new Date());
    console.log(`Workshop demo loaded into ${w.branchName} in ${Math.round((Date.now() - started) / 1000)}s: ${Object.values(w.made).reduce((a, b) => a + b, 0)} records (${w.figures.jobCards} job cards, ${w.figures.services} services, ${w.figures.customers} customers).`);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
