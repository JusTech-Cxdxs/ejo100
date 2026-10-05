// EJO 100 — load test for STAGING (never production).
// Install k6 (https://k6.io), sign in to STAGING in a browser, copy the session cookie value
// (DevTools → Application → Cookies → better-auth.session_token), then run:
//   k6 run -e BASE=https://<staging-url> -e COOKIE='better-auth.session_token=<value>' ops/load-test/k6-portal.js
// Stages ramp 10 → 50 → 100 → 250 virtual users. Read p95 / p99 and the error rate at the end.
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '2m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '2m', target: 250 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],          // under 1% errors
    http_req_duration: ['p(95)<2500', 'p(99)<5000'], // ms — tune after the first run
  },
};

const BASE = __ENV.BASE;
const params = { headers: { Cookie: __ENV.COOKIE }, redirects: 0 };
const PAGES = ['/dashboard', '/workshop/custody', '/workshop/job-cards', '/inventory/parts', '/security', '/notifications', '/analytics'];

export default function () {
  const path = PAGES[Math.floor(Math.random() * PAGES.length)];
  const res = http.get(`${BASE}${path}`, params);
  check(res, { 'page loads (200)': (r) => r.status === 200, 'not sent to login': (r) => r.status !== 307 && r.status !== 302 });
  sleep(1 + Math.random() * 2); // people read before clicking again
}
