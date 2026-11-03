/**
 * Loads (or removes) the whole demo in the demo organisation: the demo people
 * with their sign-ins (lib/demo/people-load.ts, when DEMO_STAFF_PASSWORD is
 * set), the plant demo in its assembly plant (lib/plant/demo) and the six
 * months of the workshop at Isolo (lib/workshop/demo):
 *
 *   npm run demo:reset                 the organisation marked as the demo (the seed's own when none is)
 *   npm run demo:reset -- --org kewalram-nigeria    marks that organisation as the demo first
 *   npm run demo:reset -- --remove     take the demo records out (workshop and plant), load nothing (people are kept, switched off only by un-marking the organisation)
 *
 * Refused against a production database unless DEMO_RESET_CONFIRM is set to
 * "replace the demo records": the reset deletes the previous demo's records
 * (only those, marked EJO-DEMO) and writes the plan again as of now. Needs
 * DATABASE_URL. Prints counts, never data or secrets. Every step is audited.
 */
import { prisma } from '@ejo/database';
import { loadPlantDemo, removePlantDemo } from '../lib/plant/demo/load';
import { loadWorkshopDemo, removeWorkshopDemo } from '../lib/workshop/demo/load';
import { describeDemoPeople, loadDemoPeople } from '../lib/demo/people-load';
import { demoOrganisations } from './demo-people';

const CONFIRM = 'replace the demo records';

function looksProduction(): string | null {
  const url = process.env.DATABASE_URL ?? '';
  if (process.env.NODE_ENV === 'production') return 'NODE_ENV is production';
  if (process.env.VERCEL_ENV === 'production' || process.env.RENDER_SERVICE_ID) return 'this is a hosted environment';
  if (/supabase\.co|supabase\.com|pooler\.|amazonaws\.com|render\.com|neon\.tech/i.test(url)) return 'DATABASE_URL points at a hosted database';
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const remove = args.includes('--remove');
  const slug = args.includes('--org') ? args[args.indexOf('--org') + 1] : undefined;
  const why = looksProduction();
  if (why && process.env.DEMO_RESET_CONFIRM !== CONFIRM) {
    console.error(`Refused: ${why}. The reset deletes the previous demo's plant records (and only those) and loads them again.\nTo go ahead, run it with DEMO_RESET_CONFIRM="${CONFIRM}".`);
    process.exit(2);
  }
  const orgs = await demoOrganisations(slug);
  if (!orgs.length) { console.error('No organisation is marked as a demo, and the seed’s organisation does not exist yet.'); process.exit(1); }
  if (orgs.length > 1) { console.error(`Several organisations are marked as demos; say which with --org <slug>: ${orgs.map((c) => c.slug).join(', ')}`); process.exit(1); }
  const org = orgs[0]!;
  if (org.marked) console.log(`${org.name} (${org.slug}) is now marked as the demo organisation.`);
  if (remove) {
    const w = await removeWorkshopDemo(org.id);
    const r = await removePlantDemo(org.id);
    console.log(`Removed the workshop demo from ${org.name}: ${w} records. Removed the plant demo: ${r.vehicles} vehicles and ${r.shipments} shipments (with everything hanging off them).`);
    return;
  }
  const started = Date.now();
  console.log(describeDemoPeople(await loadDemoPeople(prisma, org.id, process.env, null)));
  const r = await loadPlantDemo(org.id, new Date());
  console.log(`Plant demo loaded into ${org.name} → ${r.plantName} in ${Math.round((Date.now() - started) / 100) / 10}s.`);
  console.log(`Removed first: ${r.removed.vehicles} vehicles, ${r.removed.shipments} shipments.`);
  console.log(`Made: ${r.made.people} people, ${r.made.shipments} shipments, ${r.made.kits} kits, ${r.made.vehicles} vehicles, ${r.made.visits} station visits, ${r.made.defects} defects, ${r.made.audits} QA audits, ${r.made.pdis} PDIs.`);
  console.log(`Figures: ${JSON.stringify(r.figures.byStage)} · FTT ${r.figures.ftt}% · ${r.figures.dpu} defects per unit.`);
  const w = await loadWorkshopDemo(org.id, new Date());
  console.log(`Workshop demo loaded into ${w.branchName} in ${Math.round((Date.now() - started) / 100) / 10}s total (removed ${w.removed} records of the previous demo).`);
  console.log(`Made: ${Object.entries(w.made).map(([k, v]) => `${v} ${k}`).join(', ')}.`);
  console.log(`Figures: ${JSON.stringify(w.figures)}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
