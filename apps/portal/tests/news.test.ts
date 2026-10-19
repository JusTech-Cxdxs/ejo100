/**
 * News & media: the story rules (headline, summary, body, cover address,
 * date, web address), the article Markdown the website renders (safe: no
 * HTML, only https or own-site links and pictures), the permission, the seed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkNews, readingMinutes, slugify } from '../lib/news/core';
import { parseArticle, articleText, safeArticleHref } from '@ejo/ui/src/article';
import { ROLE_GRANTS, PERMISSIONS } from '../lib/authz/catalogue';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const good = { title: 'SOUEAST assembly begins in Lagos', summary: 'The first locally assembled SUVs roll off the line at the Isolo hub this month.', body: 'In September 2026 the hub began assembling SOUEAST passenger vehicles — the first cars on a line that opened with trucks.' };

test('a story needs a headline, a summary and a body; the address comes from the headline', () => {
  const r = checkNews(good);
  assert.ok(r.ok);
  assert.equal(r.value.slug, 'soueast-assembly-begins-in-lagos');
  assert.equal(r.value.category, 'NEWS');
  assert.equal(r.value.isFeatured, false);
  assert.equal(checkNews({ ...good, title: 'Hi' }).ok, false);
  assert.equal(checkNews({ ...good, summary: 'Too short' }).ok, false);
  assert.equal(checkNews({ ...good, body: 'short' }).ok, false);
  assert.match((checkNews({ ...good, summary: 'Call us on 0803 123 4567 today for the best deals in town' }) as { message: string }).message, /phone/);
  assert.equal(checkNews({ ...good, body: `${good.body} <script>alert(1)</script>` }).ok, false);
  assert.equal(checkNews({ ...good, coverImageUrl: 'http://x.com/a.jpg' }).ok, false);
  const c = checkNews({ ...good, coverImageUrl: 'https://cdn.example.com/a.jpg', coverAlt: 'The line', category: 'MILESTONE', isFeatured: 'on', publishedAt: '2026-09-15', slug: 'My Custom Address!' });
  assert.ok(c.ok);
  assert.equal(c.value.coverImageUrl, 'https://cdn.example.com/a.jpg');
  assert.equal(c.value.category, 'MILESTONE');
  assert.equal(c.value.isFeatured, true);
  assert.equal(c.value.slug, 'my-custom-address');
  assert.equal(c.value.publishedAt?.toISOString(), '2026-09-14T23:00:00.000Z'); // the Lagos day starts at 23:00 UTC the evening before
  assert.equal(slugify('Afcott Grains & the Kano plant — 2026!'), 'afcott-grains-and-the-kano-plant-2026');
  assert.equal(readingMinutes('word '.repeat(450)), 2);
});

test('article Markdown: headings, lists, quotes, pictures, links — never HTML, never http or javascript links', () => {
  const blocks = parseArticle(`## From trucks to family cars\n\nA paragraph with **bold**, *italic* and [a link](https://example.com/x).\n\n- one\n- two\n\n1. first\n2. second\n\n> A quote.\n\n![The line](https://cdn.example.com/line.jpg "Technicians at work")\n\n![bad](javascript:alert(1))\n\n<b>raw</b> stays text [evil](http://insecure.example) and [own](/news/x)\n\n---`);
  assert.equal(blocks[0]!.t, 'h');
  assert.equal((blocks[0] as { id: string }).id, 'from-trucks-to-family-cars');
  assert.equal(blocks[1]!.t, 'p');
  assert.equal(blocks[2]!.t, 'ul');
  assert.equal(blocks[3]!.t, 'ol');
  assert.equal(blocks[4]!.t, 'quote');
  assert.deepEqual(blocks[5], { t: 'img', src: 'https://cdn.example.com/line.jpg', alt: 'The line', caption: 'Technicians at work' });
  // The javascript: picture is dropped entirely; raw HTML is plain text; the http link becomes text; the own-site link stays.
  const text = articleText(blocks);
  assert.ok(text.includes('<b>raw</b>'));
  assert.ok(!JSON.stringify(blocks).includes('javascript:'));
  assert.ok(!JSON.stringify(blocks).includes('http://insecure'));
  assert.ok(JSON.stringify(blocks).includes('"href":"/news/x"'));
  assert.equal(blocks[blocks.length - 1]!.t, 'hr');
  assert.equal(safeArticleHref('//evil.com'), null);
  assert.equal(safeArticleHref('https://ok.example/path?q=1'), 'https://ok.example/path?q=1');
  // The renderer never injects HTML.
  assert.doesNotMatch(read('../../packages/ui/src/ArticleBody.tsx'), /dangerouslySetInnerHTML/);
});

test('publishing is a right of the communications team, administrators, executives and IT — not of branch staff', () => {
  assert.ok('website.news.manage' in PERMISSIONS);
  for (const r of ['broadcaster', 'administrator', 'executive', 'it-administrator']) assert.equal(ROLE_GRANTS[r]?.['website.news.manage'], 'ALL', r);
  for (const r of ['workshop-manager', 'technician', 'receptionist', 'customer-care', 'finance-officer']) assert.equal(ROLE_GRANTS[r]?.['website.news.manage'], undefined, r);
  const actions = read('lib/actions/news.ts');
  assert.match(actions, /authorize\(PERM/);
  assert.match(actions, /refuseDuringAssist\('news\.save'\)/);
  // Published stories are never deleted, only archived; drafts can be.
  assert.match(actions, /deleteMany\(\{ where: \{ id, organisationId, status: 'DRAFT' \} \}\)/);
});

test('the first stories are seeded once, additively, for a single-organisation platform', () => {
  const sql = read('../../scripts/postdeploy/0007-first-news-stories.sql');
  assert.match(sql, /count\(\*\) FROM "organisations" WHERE "isActive"\) <> 1 THEN RETURN/);
  assert.match(sql, /IF EXISTS \(SELECT 1 FROM "news_posts" WHERE "organisationId" = org\) THEN RETURN/);
  assert.equal((sql.match(/INSERT INTO "news_posts"/g) ?? []).length, 4);
  assert.doesNotMatch(sql, /\b(DELETE|DROP|TRUNCATE|UPDATE)\b/);
  assert.match(read('lib/schema-health-core.ts'), /news_posts/);
  // The website's own copy of the first stories matches the seed's addresses.
  const site = read('../website/lib/news/stories.ts');
  for (const slug of sql.match(/org, '([a-z0-9-]+)'/g)!.map((m) => m.slice(6, -1))) assert.ok(site.includes(`'${slug}'`), slug);
});
