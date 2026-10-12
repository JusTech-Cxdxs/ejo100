// Turns the Playwright results into GitHub annotations, so every outcome is
// readable from the checks API as well as the web page:
//   ::error   — a test that failed (or a known-defect test that unexpectedly passed)
//   ::warning — a test that only passed on retry (flaky)
//   ::notice  — a known product defect (test.fail) still reproducing, and the totals
import { readFileSync, existsSync } from 'node:fs';

const file = new URL('./report/results.json', import.meta.url);
if (!existsSync(file)) { console.log('::error title=e2e::No results file — the test run did not start.'); process.exit(0); }
const data = JSON.parse(readFileSync(file, 'utf8'));
const errors = [];
const warnings = [];
const notices = [];
const clean = (s) => String(s ?? '').replace(/\u001b\[[0-9;]*m/g, '');
// The first message of a result (errors[] carries it when error is empty).
const msgOf = (r) => clean(r?.error?.message || (r?.errors ?? []).map((e) => e?.message).filter(Boolean)[0] || r?.error?.value || r?.status || '');
// Where it failed: the spec line of the first error (not just the test's first line).
const locOf = (r) => {
  const e = r?.error ?? (r?.errors ?? [])[0];
  const l = e?.location ?? (r?.errors ?? []).map((x) => x?.location).filter(Boolean)[0];
  const at = l ? `${String(l.file).split('/').pop()}:${l.line}` : '';
  // A helper's line alone says little — add the spec line that called it.
  const spec = (clean(e?.stack ?? '').match(/([\w-]+\.spec\.ts):(\d+)/) ?? [])[0];
  return at || spec ? `@${[at, spec].filter((x, i, a) => x && a.indexOf(x) === i).join(' ← ')} ` : '';
};
const titleOf = (trail, spec) => [...trail, spec.title].filter(Boolean).join(' › ').replace(/[\n:,]/g, ' ').slice(0, 180);
const where = (spec) => (spec.file ? `${spec.file}:${spec.line}` : '');
const perFile = new Map();
const intermittent = [];
const skipped = [];
function walk(suite, trail) {
  for (const s of suite.suites ?? []) walk(s, [...trail, s.title]);
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const ms = (t.results ?? []).reduce((a, r) => a + (r.duration ?? 0), 0);
      if (spec.file) perFile.set(spec.file, (perFile.get(spec.file) ?? 0) + ms);
      const last = t.results?.[t.results.length - 1];
      const title = titleOf(trail, spec);
      const knownDefect = (t.annotations ?? []).find((a) => a.type === 'fail');
      // Intermittent known defects recorded at run time (e.g. E2E-11), whatever the outcome.
      for (const a of [...(t.annotations ?? []), ...(t.results ?? []).flatMap((r) => r.annotations ?? [])]) {
        if (/^E2E-\d+$/.test(a.type ?? '')) intermittent.push(`${a.type} in ${title}: ${(a.description ?? '').slice(0, 500)}`);
      }
      if (t.status === 'unexpected') {
        const msg = knownDefect && last?.status === 'passed'
          ? `Marked as a known defect (${knownDefect.description ?? ''}) but it PASSED — the defect looks fixed; remove test.fail.`
          : msgOf(last).split('\n').slice(0, 6).join(' | ').slice(0, 900);
        errors.push(`::error title=${title}::${where(spec)} ${locOf(last)}${msg.replace(/[\r\n]/g, ' ')}`);
      } else if (t.status === 'flaky') {
        const first = t.results?.[0];
        warnings.push(`::warning title=FLAKY ${title}::${where(spec)} passed on retry; first attempt: ${locOf(first)}${msgOf(first).split('\n').filter(Boolean).slice(0, 4).join(' | ').slice(0, 600)}`);
      } else if (t.status === 'skipped') {
        const why = (t.annotations ?? []).find((a) => a.type === 'skip')?.description ?? '';
        skipped.push(`${title}${why ? ` — ${why}` : ''}`);
      } else if (t.status === 'expected' && knownDefect) {
        notices.push(`::notice title=Known defect ${title}::${(knownDefect.description ?? '').slice(0, 400)}`);
      }
    }
  }
}
for (const s of data.suites ?? []) walk(s, [s.title]);
// GitHub keeps at most 10 annotations of each kind per step — the workflow
// runs this several times with PART=0,1,2… and each prints its own slice.
const part = Number(process.env.PART ?? 0);
const start = part === 0 ? 0 : 9 + (part - 1) * 10;
const slice = (list) => list.slice(start, part === 0 ? 9 : start + 10);
for (const line of slice(errors)) console.log(line);
for (const line of slice(warnings)) console.log(line);
for (const line of slice(notices)) console.log(line);
if (part === 0) {
  const st = data.stats ?? {};
  const files = [...perFile.entries()].sort((a, b) => b[1] - a[1]).map(([f, ms]) => `${f.replace(/\.spec\.ts$/, '')} ${Math.round(ms / 1000)}s`).join(' · ');
  console.log(`::notice title=e2e time per file (test time incl. retries)::${files}`);
  if (skipped.length) console.log(`::notice title=Skipped tests (${skipped.length})::${skipped.slice(0, 8).join(' ⏎ ').replace(/[\r\n]/g, ' ').slice(0, 2000)}`);
  const seen = [...new Set(intermittent)];
  if (seen.length) console.log(`::notice title=Intermittent known defects (${seen.length})::${seen.slice(0, 4).join(' ⏎ ').replace(/[\r\n]/g, ' ').slice(0, 3500)}`);
  console.log(`::notice title=e2e totals::expected ${st.expected ?? '?'} · unexpected ${st.unexpected ?? '?'} · flaky ${st.flaky ?? '?'} · skipped ${st.skipped ?? '?'} · ${Math.round((st.duration ?? 0) / 1000)} s · ${errors.length} failing, ${warnings.length} flaky, ${notices.length} known defects`);
}
console.log(`${errors.length} failing test(s), ${warnings.length} flaky, ${notices.length} known defect(s).`);
