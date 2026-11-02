/**
 * Loads (or removes) the plant demo in an organisation's assembly plant:
 *
 *   npm run demo:reset                 the organisation that has an assembly plant (asks when there are several)
 *   npm run demo:reset -- --org kewalram-nigeria
 *   npm run demo:reset -- --remove     take the demo records out, load nothing
 *
 * Refused against a production database unless DEMO_RESET_CONFIRM is set to
 * "replace the demo records": the reset deletes the previous demo's records
 * (only those, marked EJO-DEMO) and writes the plan again as of now. Needs
 * DATABASE_URL. Prints counts, never data or secrets.
 */
import { prisma } from '@ejo/database';
import { loadPlantDemo, removePlantDemo } from '../lib/plant/demo/load';

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
  const orgArg = args[args.indexOf('--org') + 1];
  const slug = args.includes('--org') ? orgArg : process.env.DEMO_ORG_SLUG;
  const why = looksProduction();
  if (why && process.env.DEMO_RESET_CONFIRM !== CONFIRM) {
    console.error(`Refused: ${why}. The reset deletes the previous demo's plant records (and only those) and loads them again.\nTo go ahead, run it with DEMO_RESET_CONFIRM="${CONFIRM}".`);
    process.exit(2);
  }
  const candidates = await prisma.organisation.findMany({ where: slug ? { slug } : { businessUnits: { some: { branches: { some: { type: 'ASSEMBLY_PLANT' } } } } }, select: { id: true, slug: true, name: true } });
  if (!candidates.length) { console.error(slug ? `No organisation with the slug "${slug}".` : 'No organisation has an assembly plant yet. Open it first (Assembly plant → Open the assembly plant now).'); process.exit(1); }
  if (candidates.length > 1) { console.error(`Several organisations have an assembly plant; say which with --org <slug>: ${candidates.map((c) => c.slug).join(', ')}`); process.exit(1); }
  const org = candidates[0]!;
  if (remove) {
    const r = await removePlantDemo(org.id);
    console.log(`Removed the plant demo from ${org.name}: ${r.vehicles} vehicles and ${r.shipments} shipments (with everything hanging off them).`);
    return;
  }
  const started = Date.now();
  const r = await loadPlantDemo(org.id, new Date());
  console.log(`Plant demo loaded into ${org.name} → ${r.plantName} in ${Math.round((Date.now() - started) / 100) / 10}s.`);
  console.log(`Removed first: ${r.removed.vehicles} vehicles, ${r.removed.shipments} shipments.`);
  console.log(`Made: ${r.made.people} people, ${r.made.shipments} shipments, ${r.made.kits} kits, ${r.made.vehicles} vehicles, ${r.made.visits} station visits, ${r.made.defects} defects, ${r.made.audits} QA audits, ${r.made.pdis} PDIs.`);
  console.log(`Figures: ${JSON.stringify(r.figures.byStage)} · FTT ${r.figures.ftt}% · ${r.figures.dpu} defects per unit.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
