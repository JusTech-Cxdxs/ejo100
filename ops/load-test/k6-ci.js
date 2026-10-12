// EJO 100 — staged load test for the CI instance (never production, never staging
// without the owner's say-so). Runs in .github/workflows/security.yml against ONE
// `next start` on a 2-vCPU GitHub runner with Postgres 16 on the same machine.
//
//   k6 run -e BASE=http://localhost:3001 -e ACTION_MAP=actions.json ops/load-test/k6-ci.js
//
// Stages (sequential, ~6.5 min): smoke → baseline → ramp → spike → soak → recovery.
// Workloads per iteration (weighted): live pulse 50 %, heavy pages 30 %, search 10 %,
// sign-in 5 %, list pages 5 %; plus a separate low-rate WRITE scenario (create →
// stop → delete a broadcast) running through the baseline, ramp and soak stages.
//
// Thresholds are PROPOSED SLOs (not agreed with the owner yet):
//   pages p95 < 1500 ms · live pulse p95 < 500 ms · error rate < 1 %.
// Single instance only: load balancing / horizontal scaling is NOT exercised here
// (see k6-failover.js for the two-instance check).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:3001';
const MAP = __ENV.ACTION_MAP ? JSON.parse(open(__ENV.ACTION_MAP)) : {};
const idOf = (name) => Object.keys(MAP).find((k) => MAP[k].name === name);
const pageOf = (name) => { const a = MAP[idOf(name)]; return a ? a.page.replace(/\[[^\]]+\]/g, 'x') : '/dashboard'; };
const PASSWORD = 'E2e-Test-Pass-2026!';
const STAFF = ['admin@e2e.test', 'branchadmin@e2e.test', 'frontdesk@e2e.test', 'supervisor@e2e.test', 'manager@e2e.test', 'finance@e2e.test', 'store@e2e.test'];
const HEAVY = ['/dashboard', '/workshop/job-cards', '/inventory', '/analytics', '/users'];
const LISTS = ['/workshop/customers', '/workshop/vehicles', '/inventory/parts', '/warranty', '/notifications', '/schedule'];

export const errors = new Rate('ejo_errors');

const STAGES = {
  smoke: { executor: 'constant-vus', vus: 1, duration: '30s', startTime: '0s' },
  baseline: { executor: 'constant-vus', vus: 10, duration: '60s', startTime: '30s' },
  ramp: { executor: 'ramping-vus', startVUs: 10, stages: [{ duration: '60s', target: 50 }, { duration: '30s', target: 50 }], startTime: '90s' },
  spike: { executor: 'ramping-vus', startVUs: 0, stages: [{ duration: '10s', target: 120 }, { duration: '20s', target: 120 }, { duration: '10s', target: 0 }], startTime: '180s' },
  soak: { executor: 'constant-vus', vus: 25, duration: '120s', startTime: '225s' },
  recovery: { executor: 'constant-vus', vus: 10, duration: '45s', startTime: '350s' },
};
const scenarios = {};
for (const [name, s] of Object.entries(STAGES)) scenarios[name] = { ...s, exec: 'browse', tags: { stage: name }, gracefulStop: '5s' };
if (idOf('createBroadcast')) {
  scenarios.write = { executor: 'constant-arrival-rate', rate: 1, timeUnit: '6s', duration: '330s', startTime: '30s', preAllocatedVUs: 2, exec: 'write', tags: { stage: 'write' } };
}

const thresholds = { ejo_errors: ['rate<0.01'], 'http_req_failed{kind:pulse}': ['rate<0.01'] };
for (const st of Object.keys(STAGES)) {
  thresholds[`http_req_duration{stage:${st},kind:page}`] = ['p(95)<1500'];
  thresholds[`http_req_duration{stage:${st},kind:pulse}`] = ['p(95)<500'];
  thresholds[`http_req_duration{stage:${st},kind:search}`] = ['p(95)<1500'];
  thresholds[`http_req_duration{stage:${st},kind:signin}`] = ['p(95)<1500'];
  thresholds[`http_reqs{stage:${st}}`] = ['count>=0'];
  thresholds[`ejo_errors{stage:${st}}`] = ['rate<0.01'];
  for (const k of ['pulse', 'page', 'search', 'signin']) thresholds[`ejo_errors{stage:${st},kind:${k}}`] = ['rate<0.01'];
}
thresholds['http_req_duration{stage:write,kind:write}'] = ['p(95)<2000'];
thresholds['ejo_errors{stage:write}'] = ['rate<0.05'];
thresholds['ejo_errors{stage:write,kind:write}'] = ['rate<0.05'];
thresholds['http_reqs{stage:write}'] = ['count>=0'];

export const options = {
  scenarios,
  thresholds,
  summaryTrendStats: ['min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max', 'count'],
  discardResponseBodies: true,
  noCookiesReset: true,
};

const xff = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
function signIn(email, password) {
  // A distinct client address per sign-in: real users come from many addresses;
  // the per-address flood limit is tested separately (security workflow).
  const r = http.post(`${BASE}/api/auth/sign-in/email`, JSON.stringify({ email, password }), {
    headers: { 'content-type': 'application/json', origin: BASE, 'x-forwarded-for': xff() },
    tags: { kind: 'signin' }, responseType: 'none',
  });
  // "better-auth.session_token" (or "__Secure-…" when served over https).
  const name = Object.keys(r.cookies).find((k) => k.endsWith('session_token'));
  const c = name ? r.cookies[name] : null;
  return { ok: r.status === 200 && !!c && c.length > 0, status: r.status, cookie: c && c.length ? `${name}=${c[0].value}` : '' };
}

export function setup() {
  const cookies = [];
  for (const e of STAFF) { const s = signIn(e, PASSWORD); if (s.ok) cookies.push(s.cookie); }
  const master = signIn('master@e2e.test', 'E2e-Master-Pass-2026!');
  const admin = signIn('admin@e2e.test', PASSWORD);
  if (!master.ok || !admin.ok || cookies.length < STAFF.length) throw new Error(`setup sign-in failed: master=${master.ok} admin=${admin.ok} staff=${cookies.length}/${STAFF.length}`);
  // Pulse: every role. Pages: people allowed to open all of them (Master Admin, Administrator),
  // so a refused page (redirect to Access denied) never counts as a load error.
  return { cookies: [...cookies, master.cookie], pageCookies: [master.cookie, admin.cookie], master: master.cookie };
}

const logged = {};
/** First failure of each kind per VU goes to the k6 log (status + start of body) for triage. */
function logOnce(kind, r) {
  if (logged[kind]) return;
  logged[kind] = true;
  console.error(`first ${kind} failure: HTTP ${r.status} ${r.request ? r.request.url : ''} location=${r.headers.Location || ''} body=${String(r.body || '').slice(0, 160).replace(/\s+/g, ' ')}`);
}

function get(path, cookie, kind) {
  const r = http.get(`${BASE}${path}`, { headers: { cookie }, redirects: 0, tags: { kind, name: kind === 'pulse' ? '/api/live/pulse' : path.split('?')[0] } });
  const ok = r.status === 200;
  errors.add(!ok, { kind });
  if (!ok) logOnce(kind, r);
  check(r, { [`${kind} 200`]: () => ok });
  return r;
}

export function browse(data) {
  const cookie = data.cookies[(__VU + __ITER) % data.cookies.length];
  const pageCookie = data.pageCookies[(__VU + __ITER) % data.pageCookies.length];
  const roll = Math.random();
  if (roll < 0.5) get('/api/live/pulse', cookie, 'pulse');
  else if (roll < 0.8) get(HEAVY[Math.floor(Math.random() * HEAVY.length)], pageCookie, 'page');
  else if (roll < 0.9) {
    // Search: the global search action (as typed in the top bar).
    const id = idOf('globalSearch');
    if (id) {
      const r = http.post(`${BASE}${pageOf('globalSearch')}`, JSON.stringify(['Ada']), { headers: { cookie: pageCookie, 'Next-Action': id, origin: BASE, 'content-type': 'text/plain;charset=UTF-8', 'x-forwarded-for': xff() }, redirects: 0, responseType: 'text', tags: { kind: 'search', name: 'globalSearch' } });
      const ok = r.status === 200 && !/\n\d+:E\{/.test(r.body || '');
      errors.add(!ok, { kind: 'search' });
      if (!ok) logOnce('search', r);
    } else get('/workshop/job-cards?q=JC', cookie, 'search');
  } else if (roll < 0.95) {
    const s = signIn(STAFF[Math.floor(Math.random() * STAFF.length)], PASSWORD);
    errors.add(!s.ok, { kind: 'signin' });
    if (!s.ok) logOnce('signin', { status: s.status, headers: {}, body: '' });
  } else get(LISTS[Math.floor(Math.random() * LISTS.length)], pageCookie, 'page');
  sleep(0.2 + Math.random() * 0.6);
}

function act(name, args, cookie) {
  const enc = (v) => (v instanceof Date ? `$D${v.toISOString()}` : v);
  const body = JSON.stringify(args.map((a) => (a && typeof a === 'object' && !Array.isArray(a) ? Object.fromEntries(Object.entries(a).map(([k, v]) => [k, enc(v)])) : enc(a))));
  const r = http.post(`${BASE}${pageOf(name)}`, body, { headers: { cookie, 'Next-Action': idOf(name), origin: BASE, 'content-type': 'text/plain;charset=UTF-8' }, redirects: 0, responseType: 'text', tags: { kind: 'write', name } });
  const err = r.status !== 200 || /\n\d+:E\{/.test(r.body || '');
  errors.add(err, { kind: 'write' });
  if (err) logOnce(`write ${name}`, r);
  const m = (r.body || '').match(/"id":"([a-z0-9]+)"/);
  return { ok: !err, id: m ? m[1] : null };
}

export function write(data) {
  const c = act('createBroadcast', [{ category: 'NEWS', title: `Load test ${__ITER}`, message: 'Load test broadcast (CI)', audience: 'ALL', audienceIds: [], startsAt: new Date(), duration: 'm5', sendEmail: false }], data.master);
  if (c.ok && c.id) {
    act('stopBroadcast', [c.id], data.master);
    act('deleteBroadcast', [c.id], data.master);
  }
}

export function handleSummary(data) {
  return { [__ENV.K6_SUMMARY || 'k6-summary.json']: JSON.stringify(data) };
}
