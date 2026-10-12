// Turns failed Playwright tests into GitHub annotations (::error), so a
// failure's reason is readable from the checks API as well as the web page.
import { readFileSync, existsSync } from 'node:fs';

const file = new URL('./report/results.json', import.meta.url);
if (!existsSync(file)) { console.log('::error title=e2e::No results file — the test run did not start.'); process.exit(0); }
const data = JSON.parse(readFileSync(file, 'utf8'));
const out = [];
function walk(suite, trail) {
  for (const s of suite.suites ?? []) walk(s, [...trail, s.title]);
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const last = t.results?.[t.results.length - 1];
      if (last && last.status !== 'passed' && last.status !== 'skipped') {
        const msg = (last.error?.message ?? last.status).replace(/\u001b\[[0-9;]*m/g, '').split('\n').slice(0, 6).join(' | ').slice(0, 900);
        out.push(`::error title=${[...trail, spec.title].filter(Boolean).join(' › ').replace(/[\n:,]/g, ' ').slice(0, 180)}::${msg.replace(/[\r\n]/g, ' ')}`);
      }
    }
  }
}
for (const s of data.suites ?? []) walk(s, [s.title]);
for (const line of out.slice(0, 40)) console.log(line);
console.log(`${out.length} failing test(s).`);
