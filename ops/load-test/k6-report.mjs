#!/usr/bin/env node
/**
 * Turns a k6 summary JSON into a job-summary table + one annotation per stage
 * (CI exposes only annotations through the API). Never fails the job: the SLOs
 * are PROPOSED; breaches are reported as warnings.
 *   node ops/load-test/k6-report.mjs k6-summary.json stage "smoke:30,baseline:60,..."
 */
import { readFileSync, appendFileSync } from 'node:fs';

const [file, tag = 'stage', durations = ''] = process.argv.slice(2);
const data = JSON.parse(readFileSync(file, 'utf8'));
const m = data.metrics;
const secs = Object.fromEntries(durations.split(',').filter(Boolean).map((x) => x.split(':')).map(([k, v]) => [k, Number(v)]));
const stages = Object.keys(secs);
const kinds = ['pulse', 'page', 'search', 'signin', 'write'];
const ms = (v) => (v === undefined ? '–' : `${Math.round(v)}`);
const rows = [];
const notes = [];
for (const st of stages) {
  const reqs = m[`http_reqs{${tag}:${st}}`]?.values?.count ?? 0;
  const err = m[`ejo_errors{${tag}:${st}}`]?.values?.rate;
  const parts = [];
  for (const k of tag === 'stage' ? kinds : ['']) {
    const key = tag === 'stage' ? `http_req_duration{${tag}:${st},kind:${k}}` : `http_req_duration{${tag}:${st}}`;
    const v = m[key]?.values;
    if (!v || !v.count) continue;
    const slo = k === 'pulse' ? 500 : k === 'write' ? 2000 : 1500;
    const breach = v['p(95)'] > slo;
    rows.push(`| ${st} | ${k || 'all'} | ${v.count} | ${ms(v.med)} | ${ms(v['p(90)'])} | ${ms(v['p(95)'])}${breach ? ' ⚠️' : ''} | ${ms(v['p(99)'])} | ${ms(v.max)} |`);
    parts.push(`${k || 'all'} n=${v.count} p50=${ms(v.med)} p90=${ms(v['p(90)'])} p95=${ms(v['p(95)'])} p99=${ms(v['p(99)'])} max=${ms(v.max)}${breach ? ` (p95 over proposed ${slo} ms)` : ''}`);
  }
  const rps = secs[st] ? (reqs / secs[st]).toFixed(1) : '–';
  rows.push(`| ${st} | **total** | ${reqs} | | | | | | ${rps} req/s, errors ${err === undefined ? '–' : (err * 100).toFixed(2) + '%'} |`);
  const bad = (err ?? 0) >= 0.01 || parts.some((p) => p.includes('over proposed'));
  notes.push(`::${bad ? 'warning' : 'notice'} title=${file.replace(/[.:,]/g, '_')} ${st}::${rps} req/s; errors ${err === undefined ? '–' : (err * 100).toFixed(2) + '%'}; ${parts.join(' | ')}`);
}
const thr = Object.entries(m).filter(([, v]) => v.thresholds).flatMap(([k, v]) => Object.entries(v.thresholds).filter(([, t]) => !t.ok).map(([e]) => `${k} ${e}`));
const md = [`### k6 — ${file}`, '', 'Proposed SLOs: pages p95 < 1.5 s, pulse p95 < 500 ms, error rate < 1 %. One instance, 2-vCPU runner, Postgres on the same machine.', '', '| Stage | Kind | Requests | p50 ms | p90 ms | p95 ms | p99 ms | max ms | |', '|---|---|---|---|---|---|---|---|---|', ...rows, '', thr.length ? `Proposed thresholds breached: ${thr.join('; ')}` : 'All proposed thresholds met.', ''].join('\n');
console.log(md);
for (const n of notes) console.log(n);
if (thr.length) console.log(`::warning title=k6 proposed SLOs (${file})::${thr.slice(0, 20).join('; ')}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
