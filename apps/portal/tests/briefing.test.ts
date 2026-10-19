import { test } from 'node:test';
import assert from 'node:assert/strict';
import { briefingSystemPrompt, isBriefingRequest, isGreetingOnly, packToText, renderBriefing, staffBusyText, staffGreeting, type BriefingPack } from '../lib/enyo/briefing-core';

test('a briefing request is the whole picture, not one record or a how-to', () => {
  for (const m of [
    'Brief me',
    'brief me on everything happening today',
    "oh what's up how are you doing and um I need a briefing of everything that is happening um all the analytics business Analytics are we on profit",
    'What is happening in the workshop?',
    'Are we on profit this month?',
    'Give me the business analytics',
    'Catch me up',
    'How are we doing?',
    'Brief me on the Isolo branch',
    "What's happening today?",
    'what is going on',
    'A quick briefing please',
    'What needs my attention today?',
    'what work needs my attention',
    'Anything that needs my approval?',
    "What's pending?",
    'What is waiting for me',
    'my to-do list',
    'Show me the analytics',
    'Give me the numbers for this month',
    'Business performance summary',
    'How much did we make this month?',
    'What do I need to do today?',
  ]) assert.equal(isBriefingRequest(m), true, m);
  for (const m of [
    'Status of JC-2026-000412',
    'How do I open a job card?',
    'Remind me to call the customer tomorrow',
    'Draft a reply to the last email',
    'hi',
    'What is the price of a brake pad?',
    'Update JC-2026-000001 please',
    'keep it brief, what is the reorder point of brake pads',
    'in brief, who approves purchase orders?',
    'give me a brief description of the warranty policy',
    'what is happening with the Toyota Hilux in bay 3',
    "what's going on with my leave request",
    'what is going on with job card 412',
    'I was briefed about the new policy yesterday, is it live?',
    "what's the status of my parts request",
  ]) assert.equal(isBriefingRequest(m), false, m);
});

const pack: BriefingPack = {
  branch: null,
  generatedAt: 'Monday 19 October 2026, 4:10 pm (Lagos)',
  toolRuns: [{ name: 'daily_brief', ok: true }, { name: 'branch_briefing', ok: true }, { name: 'stock_alerts', ok: false, refused: true }],
  sources: [{ label: 'Dashboard', href: '/dashboard' }, { label: 'Business analytics', href: '/analytics' }],
  sections: [
    { key: 'day', title: 'Your day', data: { period: 'Today', sections: [{ what: 'Decisions waiting', count: 3, overdue: 1, all: '/approvals', items: [{ title: 'JC-2026-000007 — estimate', href: '/workshop/job-cards/abc', when: '2 h ago', overdue: true }] }], nothingWaiting: false, myNumbersThisMonth: [{ label: 'Jobs closed', value: 12 }] } },
    { key: 'pending', title: 'Waiting on others', data: { waiting: [{ number: 'PRS-2026-000003', what: 'Parts request', withWhom: 'Store Keeper (Store)', since: 'yesterday', link: '/store/requests/x' }], total: 1 } },
    { key: 'business', title: 'The business this month', data: {
      period: 'October 2026', scope: 'Whole organisation',
      money: { sales: 12_450_000, salesChangePercent: 8.4, grossProfit: 3_900_000.5, grossMarginPercent: 31.3, takings: 11_200_000, jobsFinished: 48, averageJob: 259_375, madeOf: { labour: 4_000_000, parts: 7_000_000, outsideWork: 1_000_000, sundry: 450_000 }, owedOnFinishedJobs: 1_250_000, monthProjection: 19_000_000, biggestCustomers: [{ name: 'Dangote Cement', value: 2_100_000 }], whatToDo: ['Chase the 4 overdue estimates'] },
      branches: [{ name: 'Isolo Branch', health: 'Healthy', why: ['Collections up'], jobsOpened: 30, jobsFinished: 28, collectedNaira: 9_000_000, inWorkshopNow: 11 }],
      workshopNow: { jobCardsIn: 9, vehicleServicesIn: 2, readyToCollect: 4, waitingForParts: 1, waitingForCustomer: 2 },
      decisionsWaiting: [{ what: 'Estimates', count: 4, oldestHours: 30 }],
      team: { peopleWhoHandledWork: 14, withinStandardPercent: 82, needsAttention: [{ name: 'T. Okoro' }] },
      customers: { newThisMonth: 6, supportOpen: 3, supportLate: 1 },
      readAloudTip: 'never shown', definitions: { takings: 'x' },
    } },
    { key: 'stock', title: 'Stock', data: { outOfStock: 1, atOrBelowReorderPoint: 2, parts: [{ name: 'Brake pad set', partNumber: 'BP-100', onHand: 0, reorderPoint: 4, href: '/store/parts/1' }], pricingAlerts: { soldBelowCost: 1, belowTargetMargin: 0, aboveTarget: 0, lossIfStockSoldAtTodaysPrice: 12000, href: '/inventory/pricing' } } },
    { key: 'website', title: 'Website visitors', data: null, note: 'Could not be read just now.' },
    { key: 'integrity', title: 'Integrity watch', data: { alerts: [{ title: 'Same person asked and approved', severity: 'HIGH', href: '/integrity/1' }], open: 1 } },
    { key: 'leads', title: 'Website and store', data: { period: 'Last 7 days', enquiriesFromTheWebsite: 5, byTopic: { sales: 3, referrals: 2 }, stillOpen: 2 } },
  ],
};

test('the hand-written briefing carries the figures, links and the profit verdict, and never the coaching keys', () => {
  const text = renderBriefing(pack, 'Sudeep Mittal');
  assert.match(text, /Here is your briefing, Sudeep/);
  assert.match(text, /\[JC-2026-000007 — estimate\]\(\/workshop\/job-cards\/abc\)/);
  assert.match(text, /\[PRS-2026-000003\]\(\/store\/requests\/x\)/);
  assert.match(text, /sales ₦12,450,000 \(\+8% on last month\)/);
  assert.match(text, /gross profit ₦3,900,001 \(31% margin\) — in profit on the work done/);
  assert.match(text, /Isolo Branch — Healthy/);
  assert.match(text, /Workshop now:\*\* 9 job cards/);
  assert.match(text, /Decisions waiting:\*\* Estimates 4 \(oldest 30 h\)/);
  assert.match(text, /Do first:\*\* Chase the 4 overdue estimates/);
  assert.match(text, /1 out of stock, 2 at or below the reorder point/);
  assert.match(text, /\[Brake pad set\]\(\/store\/parts\/1\) \(BP-100\) — on hand 0, reorder at 4/);
  assert.match(text, /loss if stock sold at today's price ₦12,000 · \[Pricing\]\(\/inventory\/pricing\)/);
  assert.match(text, /\[Same person asked and approved\]\(\/integrity\/1\)/);
  assert.doesNotMatch(text, /href/);
  assert.match(text, /Could not be read just now\./);
  assert.match(text, /enquiries from the website: 5/i);
  assert.doesNotMatch(text, /never shown|readAloudTip|definitions/);
  assert.match(text, /\[Dashboard\]\(\/dashboard\)/);
  assert.match(text, /writing model was busy/);
});

test('the pack for the model drops coaching keys and stays within its budget', () => {
  const text = packToText(pack);
  assert.doesNotMatch(text, /readAloudTip|definitions|never shown/);
  assert.match(text, /## The business this month/);
  assert.match(text, /"grossProfit":3900000.5/);
  assert.match(text, /## Website visitors\n\(Could not be read just now\.\)/);
  assert.ok(text.length < 9_000, `too long: ${text.length}`);
  // A huge section is cut, not sent whole.
  const big: BriefingPack = { ...pack, sections: [{ key: 'support', title: 'Support', data: { rows: Array.from({ length: 200 }, (_, i) => ({ number: `SUP-2026-${i}`, subject: 'x'.repeat(100) })) } }] };
  assert.ok(packToText(big).length < 1_100);
});

test('the briefing prompt is small and names the person, role and branch', () => {
  const p = briefingSystemPrompt({ assistantName: 'Enyo', organisationName: 'Kewalram Nigeria', personName: 'Sudeep', roleDescription: 'Executive', now: 'Monday', branch: 'Isolo Branch' });
  assert.ok(p.length < 2_000);
  assert.match(p, /briefing Sudeep \(Executive\)/);
  assert.match(p, /lead with that branch/);
  assert.match(p, /never invent/);
});

test('a greeting is answered without the model, by Lagos time, with what this person can ask', () => {
  for (const g of ['Hi', 'hey Enyo', 'Good evening', 'Hello there!', 'how far']) assert.equal(isGreetingOnly(g), true, g);
  for (const q of ['Hi, brief me', 'hey what needs my attention', 'hello who is Sudeep']) assert.equal(isGreetingOnly(q), false, q);
  const leader = staffGreeting({ firstName: 'Sudeep', assistantName: 'Enyo', leader: true, now: new Date('2026-10-19T21:00:00Z') });
  assert.match(leader, /^Good evening, Sudeep! I'm Enyo\./);
  assert.match(leader, /Are we on profit this month/);
  const tech = staffGreeting({ firstName: 'Tunde', assistantName: 'Enyo', leader: false, now: new Date('2026-10-19T08:00:00Z') });
  assert.match(tech, /^Good morning, Tunde!/);
  assert.doesNotMatch(tech, /profit/);
  assert.doesNotMatch(staffBusyText({ leader: false }), /analytics/);
  assert.match(staffBusyText({ leader: true }), /brief me[\s\S]*\[Business analytics\]\(\/analytics\)/);
});
