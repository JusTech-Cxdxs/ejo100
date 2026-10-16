/** The platform's name lives in one place (packages/enyo/src/brand.ts) and is used everywhere. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { appShortName, PLATFORM } from '../lib/brand';

const REPO = join(__dirname, '..', '..', '..', '..');

test('the brand file is copied unchanged into both apps (npm run brand:sync)', () => {
  const src = readFileSync(join(REPO, 'packages/enyo/src/brand.ts'), 'utf8');
  assert.equal(readFileSync(join(REPO, 'apps/portal/lib/brand.ts'), 'utf8'), src);
  assert.equal(readFileSync(join(REPO, 'apps/website/lib/brand.ts'), 'utf8'), src);
});

test('no screen, email, print-out or PDF spells the platform name itself', () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (['node_modules', '.next', '.test-out', 'e2e', 'tests'].includes(f)) continue;
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(f) || /brand\.ts$/.test(f)) continue;
      const code = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/['"`>]\s*Powered by EJO|EJO 100 Enterprise (Platform|OS)|['"]EJO 100['"]/.test(code)) offenders.push(p.slice(REPO.length + 1));
    }
  };
  for (const app of ['apps/portal', 'apps/website', 'packages/enyo/src']) walk(join(REPO, app));
  assert.deepEqual(offenders, []);
  assert.equal(PLATFORM.poweredBy, `Powered by ${PLATFORM.name}`);
});

test('the installed app gets a short name: the organisation\'s initials, or the one set', () => {
  assert.equal(appShortName('Kewalram Chanrai Group'), 'KCG');
  assert.equal(appShortName('Acme'), 'Acme');
  assert.equal(appShortName('Bank of the North West Region'), 'BNWR');
  assert.equal(appShortName('Kewalram Chanrai Group', 'Kewalram'), 'Kewalram');
});

test('dealer brands: a quiet text line in every email footer, in each brand\'s colour; nothing when not set', async () => {
  const { dealerBrands, renderEmailLayout } = await import('../lib/email-templates/layout');
  assert.deepEqual(dealerBrands('FOTON:#111111, ISUZU:#E4002B,SOUEAST:#F39800'), [
    { name: 'FOTON', color: '#111111' }, { name: 'ISUZU', color: '#E4002B' }, { name: 'SOUEAST', color: '#F39800' },
  ]);
  assert.deepEqual(dealerBrands('<b>X</b>:red'), [{ name: 'bXb', color: '#334155' }]);
  assert.deepEqual(dealerBrands(''), []);
  const before = process.env.NEXT_PUBLIC_DEALER_BRANDS;
  process.env.NEXT_PUBLIC_DEALER_BRANDS = 'FOTON:#111111,ISUZU:#E4002B';
  const out = renderEmailLayout({ previewText: 'p', companyName: 'Kewalram Chanrai Group', logoUrl: 'https://x.example/l.png', heading: 'Hi', bodyHtml: 'Body' });
  assert.match(out, /Authorised dealer/);
  assert.match(out, /color: #E4002B; font-weight: 800[^>]*>ISUZU</);
  assert.doesNotMatch(out, /<img[^>]*(foton|isuzu)/i);
  if (before === undefined) delete process.env.NEXT_PUBLIC_DEALER_BRANDS; else process.env.NEXT_PUBLIC_DEALER_BRANDS = before;
});
