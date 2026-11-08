/**
 * The demo organisation's working day, now (normally the daily job and the
 * dashboards do this by themselves; see lib/demo/pulse.ts):
 *
 *   npm run demo:pulse                       today, for every organisation marked as a demo
 *   npm run demo:pulse -- --at 2026-11-04T08:00:00Z   as if it were then (tests, rehearsals)
 *
 * Once per Lagos day; DEMO_DAILY_ACTIVITY=off stops it; never a real
 * organisation; never emails. Prints what it did, never data.
 */
import { prisma } from '@ejo/database';
import { runDemoPulseForAll } from '../lib/demo/pulse';

async function main() {
  const args = process.argv.slice(2);
  const at = args.includes('--at') ? new Date(args[args.indexOf('--at') + 1]!) : new Date();
  if (Number.isNaN(at.getTime())) throw new Error('--at needs a date and time, e.g. 2026-11-04T08:00:00Z');
  const results = await runDemoPulseForAll(at);
  if (!results.length) { console.log((process.env.DEMO_DAILY_ACTIVITY ?? '').trim().toLowerCase() === 'off' ? 'Demo pulse: off (DEMO_DAILY_ACTIVITY=off).' : 'Demo pulse: no organisation is marked as a demo.'); return; }
  for (const r of results) console.log(`Demo pulse ${r.dayKey}: ${r.reason}${r.ran ? ` ${JSON.stringify(r.counts)}` : ''}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
