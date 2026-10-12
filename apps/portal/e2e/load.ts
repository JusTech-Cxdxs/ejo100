/**
 * Measured load test (CI only, against the throw-away CI database — never
 * production). One `next start` process on a GitHub runner (2 vCPU), Postgres 16
 * on the same machine. The numbers are a baseline for this one instance, not a
 * claim about production capacity.
 *
 * Workloads:
 *   1. Live pulse — 50 concurrent clients polling /api/live/pulse back to back
 *      (≈ the load of several hundred open tabs at the real 10-second interval).
 *   2. Pages — 10 concurrent signed-in people opening the heaviest everyday
 *      pages back to back (dashboard, Job Cards, inventory, analytics, users).
 *   3. Sign-in — 20 sign-ins, 5 at a time.
 *
 * Writes p50 / p95 / p99, throughput and error rate to the job summary and as
 * annotations. Fails only on errors (non-2xx), not on speed: speed is reported.
 */
import { appendFileSync } from 'node:fs';
import { E2E_PASSWORD, MASTER, PEOPLE } from './people';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
const SECONDS = Number(process.env.LOAD_SECONDS ?? 30);

type Result = { name: string; n: number; errors: number; seconds: number; p50: number; p95: number; p99: number; max: number };

function pct(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

async function signIn(email: string, password: string): Promise<{ cookie: string; ms: number }> {
  const t = performance.now();
  const r = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ email, password }),
  });
  const ms = performance.now() - t;
  if (!r.ok) throw new Error(`sign-in ${email}: HTTP ${r.status}`);
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return { cookie, ms };
}

async function run(name: string, workers: number, next: (i: number) => Promise<boolean>): Promise<Result> {
  const times: number[] = [];
  let errors = 0;
  const end = Date.now() + SECONDS * 1000;
  const start = performance.now();
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    let i = w;
    while (Date.now() < end) {
      const t = performance.now();
      const ok = await next(i).catch(() => false);
      times.push(performance.now() - t);
      if (!ok) errors += 1;
      i += workers;
    }
  }));
  const seconds = (performance.now() - start) / 1000;
  times.sort((a, b) => a - b);
  return { name, n: times.length, errors, seconds, p50: pct(times, 50), p95: pct(times, 95), p99: pct(times, 99), max: times[times.length - 1] ?? 0 };
}

async function main() {
  const master = await signIn(MASTER.email, MASTER.password);
  const staff = await Promise.all(PEOPLE.slice(0, 5).map((p) => signIn(p.email, E2E_PASSWORD)));
  const cookies = [master.cookie, ...staff.map((s) => s.cookie)];

  const results: Result[] = [];

  results.push(await run('Live pulse (50 concurrent)', 50, async (i) => {
    const r = await fetch(`${BASE}/api/live/pulse`, { headers: { cookie: cookies[i % cookies.length]! } });
    await r.arrayBuffer();
    return r.ok;
  }));

  const pages = ['/dashboard', '/workshop/job-cards', '/inventory', '/analytics', '/users'];
  results.push(await run('Pages (10 concurrent, Master Admin)', 10, async (i) => {
    const r = await fetch(`${BASE}${pages[i % pages.length]}`, { headers: { cookie: master.cookie }, redirect: 'manual' });
    await r.arrayBuffer();
    return r.status === 200;
  }));

  // Sign-in: 20, five at a time.
  const signTimes: number[] = [];
  let signErrors = 0;
  const t0 = performance.now();
  for (let b = 0; b < 4; b += 1) {
    const batch = await Promise.allSettled(PEOPLE.slice(0, 5).map((p) => signIn(p.email, E2E_PASSWORD)));
    for (const x of batch) x.status === 'fulfilled' ? signTimes.push(x.value.ms) : (signErrors += 1);
  }
  signTimes.sort((a, b) => a - b);
  results.push({ name: 'Sign-in (20, 5 at a time)', n: signTimes.length + signErrors, errors: signErrors, seconds: (performance.now() - t0) / 1000, p50: pct(signTimes, 50), p95: pct(signTimes, 95), p99: pct(signTimes, 99), max: signTimes[signTimes.length - 1] ?? 0 });

  const ms = (v: number) => `${Math.round(v)} ms`;
  const rows = results.map((r) => `| ${r.name} | ${r.n} | ${(r.n / r.seconds).toFixed(1)}/s | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.p99)} | ${ms(r.max)} | ${r.errors} (${((r.errors / Math.max(1, r.n)) * 100).toFixed(2)}%) |`);
  const table = ['### Load test (one `next start`, GitHub runner, CI Postgres)', '', '| Workload | Requests | Throughput | p50 | p95 | p99 | max | Errors |', '|---|---|---|---|---|---|---|---|', ...rows, ''].join('\n');
  console.log(table);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table + '\n');
  for (const r of results) console.log(`::notice title=load ${r.name.replace(/[,:]/g, ' ')}::n=${r.n} rps=${(r.n / r.seconds).toFixed(1)} p50=${ms(r.p50)} p95=${ms(r.p95)} p99=${ms(r.p99)} max=${ms(r.max)} errors=${r.errors}`);
  if (results.some((r) => r.errors / Math.max(1, r.n) > 0.01)) {
    console.log('::error title=load::More than 1% of requests failed under load.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.log(`::error title=load::${String(e?.message ?? e).replace(/[\r\n]/g, ' ')}`);
  process.exit(1);
});
