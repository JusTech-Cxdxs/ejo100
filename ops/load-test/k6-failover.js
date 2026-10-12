// Two `next start` instances behind ops/load-test/lb.mjs (CI only). The workflow
// kills instance A ~20 s in. Requests are tagged by phase (before / during the
// first 10 s after the kill / after) so the report shows what users would see.
import http from 'k6/http';
import { sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:3010';
const KILL_AT = Number(__ENV.KILL_AT || 20);
export const errors = new Rate('ejo_errors');
const phases = ['before', 'during', 'after'];
const thresholds = {};
for (const p of phases) { thresholds[`http_req_duration{phase:${p}}`] = ['p(95)<1500']; thresholds[`ejo_errors{phase:${p}}`] = ['rate<0.01']; thresholds[`http_reqs{phase:${p}}`] = ['count>=0']; }
export const options = { scenarios: { mixed: { executor: 'constant-vus', vus: 20, duration: '60s' } }, thresholds, summaryTrendStats: ['min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max', 'count'], discardResponseBodies: true };

export function setup() {
  // Sign in on the proxy; Origin must be the configured BETTER_AUTH_URL (trusted origin).
  const r = http.post(`${BASE}/api/auth/sign-in/email`, JSON.stringify({ email: 'admin@e2e.test', password: 'E2e-Test-Pass-2026!' }), { headers: { 'content-type': 'application/json', origin: __ENV.ORIGIN || BASE } });
  if (r.status !== 200) throw new Error(`sign-in through the proxy failed: HTTP ${r.status}`);
  const c = r.cookies['better-auth.session_token'];
  return { cookie: c && c.length ? `better-auth.session_token=${c[0].value}` : '', t0: Date.now() };
}
export default function (d) {
  const s = (Date.now() - d.t0) / 1000;
  const phase = s < KILL_AT ? 'before' : s < KILL_AT + 10 ? 'during' : 'after';
  const path = Math.random() < 0.6 ? '/api/live/pulse' : ['/dashboard', '/workshop/job-cards', '/inventory'][Math.floor(Math.random() * 3)];
  const r = http.get(`${BASE}${path}`, { headers: { cookie: d.cookie }, redirects: 0, tags: { phase } });
  errors.add(r.status !== 200, { phase });
  sleep(0.3);
}
export function handleSummary(data) { return { [__ENV.K6_SUMMARY || 'k6-failover.json']: JSON.stringify(data) }; }
