/**
 * Makes (or refreshes) the demo people and their sign-ins in the demo
 * organisation:
 *
 *   npm run demo:people                     the organisation(s) marked as a demo
 *   npm run demo:people -- --org <slug>     marks that organisation as the demo first
 *
 * With no organisation marked yet, the one the base seed created (slug
 * kewalram-nigeria, or DEMO_ORG_SLUG) is marked, and the log says so — so a
 * first installation has its demo the moment DEMO_STAFF_PASSWORD is set, and
 * no other organisation is ever touched. To stop: set "isDemo" to false on
 * the organisation (scripts/v-d1-demo-people.sql shows how) and take the
 * password out of the environment; the next run switches the demo people off.
 *
 * Needs DATABASE_URL and DEMO_STAFF_PASSWORD (optionally
 * DEMO_CUSTOMER_PASSWORD; RESET_DEMO_PASSWORDS=yes to set the passwords
 * again, once). Idempotent; prints counts, never a password or an address.
 * Run by the production build (scripts/db-push-if-vercel.js) and by
 * `npm run demo:reset`.
 */
import { prisma } from '@ejo/database';
import { describeDemoPeople, loadDemoPeople, markDemoOrganisation } from '../lib/demo/people-load';

export const DEFAULT_DEMO_ORG = 'kewalram-nigeria';

/** The organisations to load, marking one when none is marked yet. */
export async function demoOrganisations(slugArg: string | undefined, env: Record<string, string | undefined> = process.env): Promise<{ id: string; name: string; slug: string; marked: boolean }[]> {
  if (slugArg) {
    const org = await prisma.organisation.findUnique({ where: { slug: slugArg }, select: { id: true, name: true, slug: true, isDemo: true } });
    if (!org) throw new Error(`No organisation with the slug "${slugArg}".`);
    if (!org.isDemo) await markDemoOrganisation(prisma, org.id, true);
    return [{ id: org.id, name: org.name, slug: org.slug, marked: !org.isDemo }];
  }
  const marked = await prisma.organisation.findMany({ where: { isDemo: true }, select: { id: true, name: true, slug: true } });
  if (marked.length) return marked.map((o) => ({ ...o, marked: false }));
  const slug = (env.DEMO_ORG_SLUG ?? '').trim() || DEFAULT_DEMO_ORG;
  const org = await prisma.organisation.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } });
  if (!org) return [];
  await markDemoOrganisation(prisma, org.id, true);
  return [{ ...org, marked: true }];
}

async function main() {
  const args = process.argv.slice(2);
  const slugArg = args.includes('--org') ? args[args.indexOf('--org') + 1] : undefined;
  const orgs = await demoOrganisations(slugArg);
  if (!orgs.length) { console.log('Demo people: no organisation is marked as a demo and the seed’s organisation does not exist yet; nothing done.'); return; }
  for (const org of orgs) {
    if (org.marked) console.log(`${org.name} (${org.slug}) is now marked as the demo organisation.`);
    const r = await loadDemoPeople(prisma, org.id, process.env, null);
    console.log(describeDemoPeople(r));
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
}
