#!/usr/bin/env node
/** ZAP baseline JSON → one annotation per target + job-summary table.
 *  node zap-report.mjs zap/portal-anon.json "Portal (signed out)" */
import { readFileSync, appendFileSync, existsSync } from 'node:fs';

const [file, label, out] = process.argv.slice(2);
// zap-baseline.py prints "Total of N URLs" and the PASS/WARN summary line.
const stdout = out && existsSync(out) ? readFileSync(out, 'utf8') : '';
const urls = stdout.match(/Total of (\d+) URLs/)?.[1] ?? '?';
const summary = stdout.match(/FAIL-NEW: \d+.*$/m)?.[0] ?? '';
if (!existsSync(file)) { console.log(`::warning title=ZAP ${label}::no report (${file}) — scan did not run`); process.exit(0); }
const z = JSON.parse(readFileSync(file, 'utf8'));
const alerts = (z.site ?? []).flatMap((s) => (s.alerts ?? []).map((a) => ({ ...a, site: s['@name'] })));
const risk = (a) => Number(a.riskcode);
alerts.sort((a, b) => risk(b) - risk(a));
const name = ['Info', 'Low', 'Medium', 'High'];
const lines = alerts.map((a) => `${name[risk(a)]} [${a.pluginid}] ${a.alert} ×${a.count ?? a.instances?.length ?? '?'} e.g. ${(a.instances?.[0]?.uri ?? '').replace(/^https?:\/\/[^/]+/, '')}${a.instances?.[0]?.param ? ` (${a.instances[0].param})` : ''}`);
const counts = [3, 2, 1, 0].map((r) => `${name[r]}=${alerts.filter((a) => risk(a) === r).length}`).join(' ');
const level = alerts.some((a) => risk(a) >= 3) ? 'error' : alerts.some((a) => risk(a) >= 2) ? 'warning' : 'notice';
console.log(`::${level} title=ZAP baseline ${label.replace(/[:,]/g, ' ')}::${urls} URLs crawled; ${counts}; ${summary}%0A${lines.join('%0A').slice(0, 6000)}`);
const md = [`### ZAP baseline — ${label}`, '', counts, '', '| Risk | Plugin | Alert | Instances | Example |', '|---|---|---|---|---|', ...alerts.map((a) => `| ${name[risk(a)]} | ${a.pluginid} | ${a.alert} | ${a.count ?? a.instances?.length ?? ''} | ${(a.instances?.[0]?.uri ?? '').replace(/^https?:\/\/[^/]+/, '')} |`), ''].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
console.log(md);
