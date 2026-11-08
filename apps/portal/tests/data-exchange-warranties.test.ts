/**
 * Warranties and open warranty claims at the cut-over (P6): the pure row
 * checks (statuses and stages from EJO's and SAP's words, vehicle or part,
 * amounts that add up, history refused), the policy a row is under, and how
 * the import is wired: old numbers kept, the two people of the import as
 * registration and verification, nothing emailed, undo to the bin only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoMap, ENTITIES, mappingProblems } from '../lib/data-exchange/fields';
import { atOrPast, checkClaimRow, checkWarrantyRow, NOT_RECORDED, openClaimStage, pickPolicy, warrantyStatus } from '../lib/data-exchange/check-warranties';
import { DATA_INVENTORY } from '../lib/governance/data-inventory';
import { planSearch, sapNumberQuery } from '../lib/search-plan';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const TODAY = '2026-11-02';

test('warranty statuses: active (expired is worked out from the dates), suspended, void, transferred; nonsense refused', () => {
  for (const w of ['', 'Active', 'valid', 'In force', 'Expired']) assert.equal(warrantyStatus(w), 'ACTIVE', w);
  assert.equal(warrantyStatus('Suspended'), 'SUSPENDED');
  assert.equal(warrantyStatus('On hold'), 'SUSPENDED');
  assert.equal(warrantyStatus('Void'), 'VOID');
  assert.equal(warrantyStatus('Cancelled'), 'VOID');
  assert.equal(warrantyStatus('Transferred'), 'TRANSFERRED');
  assert.equal(warrantyStatus('Pending?'), null);
});

test('claim stages: EJO’s words and the old system’s; settled and cancelled are history; nonsense refused', () => {
  const cases: [string, string | null][] = [
    ['', 'DRAFT'], ['Draft', 'DRAFT'], ['New', 'DRAFT'], ['With the Warranty HOD', 'PENDING_HOD'], ['Pending approval', 'PENDING_HOD'], ['With the Manager', 'PENDING_MANAGER'],
    ['Approved to submit', 'APPROVED_TO_SUBMIT'], ['Ready to submit', 'APPROVED_TO_SUBMIT'], ['Submitted', 'SUBMITTED'], ['With provider', 'SUBMITTED'], ['Sent', 'SUBMITTED'],
    ['Accepted', 'ACCEPTED'], ['Approved by provider', 'ACCEPTED'], ['Credited', 'ACCEPTED'], ['Partially accepted', 'PARTIALLY_ACCEPTED'], ['Rejected', 'REJECTED'], ['Declined', 'REJECTED'],
    ['Settled', 'CLOSED'], ['Paid', 'CLOSED'], ['Closed', 'CLOSED'], ['Cancelled', 'CLOSED'], ['Somewhere', null],
  ];
  for (const [w, s] of cases) assert.equal(openClaimStage(w), s, w);
  assert.equal(atOrPast('SUBMITTED', 'APPROVED_TO_SUBMIT'), true);
  assert.equal(atOrPast('PENDING_HOD', 'PENDING_MANAGER'), false);
});

const WH = ['MGANR', 'Covers', 'VHVIN', 'LICENSE_NUM', 'KUNNR', 'Policy', 'Provider', 'Months', 'Km', 'GWLDT', 'GWLEN', 'Start km', 'MATNR', 'SERNR', 'Evidence', 'Status', 'Notes'];
const wm = autoMap('warranties', WH);
const wrow = (o: Partial<Record<(typeof WH)[number], string>>) => WH.map((h) => o[h] ?? '');

test('a warranty row: the SAP columns map themselves; vehicle or part; policy or months; refusals', () => {
  assert.deepEqual(mappingProblems('warranties', wm), []);
  assert.deepEqual(mappingProblems('warranties', { ...wm, vin: null, plateNumber: null, partNumber: null }), ['Choose the column for the vehicle’s chassis number (VIN) or plate, or the part number: a warranty covers a vehicle or a part.']);
  const ok = checkWarrantyRow(wrow({ MGANR: '000412', Covers: 'Vehicle', VHVIN: 'JAANLR85EL7100001', KUNNR: '0001000101', Policy: 'DEMO-ISZ-3Y', GWLDT: '24.02.2021', 'Start km': '25', Evidence: 'Invoice 90100001' }), wm, TODAY);
  assert.equal(ok.status, 'GOOD', JSON.stringify(ok.issues));
  assert.equal(ok.values!.warrantyNumber, '412');
  assert.equal(ok.values!.kind, 'ASSET');
  assert.equal(ok.values!.startsAt, '2021-02-24');
  assert.equal(ok.values!.startReading, 25);
  assert.deepEqual(ok.keys, ['wty:412']);
  // A part number with no vehicle is a part warranty; one with the word Part and a vehicle too.
  const part = checkWarrantyRow(wrow({ MGANR: 'B-1', MATNR: '8-98100017-7', SERNR: 'exb-1', KUNNR: '0001000102', Policy: 'DEMO-BAT-12M', GWLDT: '01.06.2026' }), wm, TODAY);
  assert.equal(part.values?.kind, 'PART');
  assert.equal(part.values?.serialNumber, 'EXB-1');
  assert.equal(checkWarrantyRow(wrow({ MGANR: 'B-2', Covers: 'Part', VHVIN: 'JAANLR85EL7100002', MATNR: '8-98100017-7', Policy: 'DEMO-BAT-12M', GWLDT: '01.06.2026' }), wm, TODAY).values?.kind, 'PART');
  // No policy: months (and km) find it on the server.
  const byTerms = checkWarrantyRow(wrow({ MGANR: 'W-3', VHVIN: 'JAANLR85EL7100003', Provider: 'Isuzu Motors Ltd (demo)', Months: '36', Km: '100,000', GWLDT: '22.06.2020' }), wm, TODAY);
  assert.equal(byTerms.status, 'GOOD', JSON.stringify(byTerms.issues));
  assert.equal(byTerms.values?.months, 36);
  assert.equal(byTerms.values?.distanceLimit, 100000);
  const err = (o: Partial<Record<(typeof WH)[number], string>>) => checkWarrantyRow(wrow(o), wm, TODAY).issues.filter((i) => i.level === 'error').map((i) => i.message);
  assert.deepEqual(err({ VHVIN: 'JAANLR85EL7100001', Policy: 'X', GWLDT: '01.01.2024' }), ['Warranty number is required (SAP MGANR or the old system’s warranty or certificate number).']);
  assert.match(err({ MGANR: 'W-4', VHVIN: 'JAANLR85EL7100001', Policy: 'X', GWLDT: '15.03.2027' })[0]!, /is in the future: a warranty starts on the day/);
  assert.match(err({ MGANR: 'W-5', Policy: 'X', GWLDT: '01.01.2024' })[0]!, /Which vehicle does it cover\?/);
  assert.match(err({ MGANR: 'W-6', VHVIN: 'JAANLR85EL7100001', GWLDT: '01.01.2024' })[0]!, /Which policy is it under\?/);
  assert.match(err({ MGANR: 'W-7', VHVIN: 'JAANLR85EL7100001', Policy: 'X', GWLDT: '01.01.2024', Status: 'Pending?' })[0]!, /is not a warranty status EJO knows/);
  assert.match(err({ MGANR: 'W-8', VHVIN: 'JAANLR85EL7100001', Policy: 'X', GWLDT: '01.01.2024', GWLEN: '01.01.2023' })[0]!, /is not after the start/);
  // Ended: kept for its history, with a note. Suspended without a reason: a note.
  const ended = checkWarrantyRow(wrow({ MGANR: 'W-9', VHVIN: 'JAANLR85EL7100001', Policy: 'X', GWLDT: '01.01.2021', GWLEN: '31.12.2023' }), wm, TODAY);
  assert.equal(ended.status, 'WARNING');
  assert.match(ended.issues[0]!.message, /Already ended on 2023-12-31: kept for its history/);
  assert.match(checkWarrantyRow(wrow({ MGANR: 'W-10', VHVIN: 'JAANLR85EL7100001', Policy: 'X', GWLDT: '01.01.2024', Status: 'Suspended' }), wm, TODAY).issues[0]!.message, /Suspended with no reason given/);
});

type P = Parameters<typeof pickPolicy>[1][number];
const pol = (o: Partial<P>): P => ({ id: o.code ?? 'p', code: 'P', name: 'Policy', kind: 'ASSET', providerId: 'pr', providerName: 'Isuzu Motors Ltd (demo)', durationMonths: 36, durationUnit: 'MONTHS', distanceLimit: 100000, coverageSummary: 'All', exclusions: null, conditions: null, isActive: true, archivedAt: null, ...o });

test('the policy: by code, then by name; or the one with the same months, km and provider; none or several are refused', () => {
  const policies = [pol({ code: 'DEMO-ISZ-3Y', name: 'Isuzu 3 years' }), pol({ code: 'DEMO-SEM-5Y', name: 'Soueast 5 years', providerName: 'Soueast Motor Co., Ltd (demo)', durationMonths: 60, distanceLimit: 150000 }), pol({ code: 'OLD-ISZ', name: 'Old Isuzu', archivedAt: new Date('2025-01-01') })];
  const base = { policy: null, provider: null, months: null, distanceLimit: null, kind: 'ASSET' as const };
  assert.equal(pickPolicy({ ...base, policy: 'demo-isz-3y' }, policies).policy?.code, 'DEMO-ISZ-3Y');
  assert.equal(pickPolicy({ ...base, policy: 'Soueast 5 Years' }, policies).policy?.code, 'DEMO-SEM-5Y');
  assert.equal(pickPolicy({ ...base, policy: 'OLD-ISZ' }, policies).policy?.code, 'OLD-ISZ', 'an archived policy named outright is kept, for its history');
  assert.match(pickPolicy({ ...base, policy: 'NOPE' }, policies).error!, /There is no warranty policy “NOPE” in EJO/);
  const found = pickPolicy({ ...base, months: 60, distanceLimit: 150000 }, policies);
  assert.equal(found.policy?.code, 'DEMO-SEM-5Y');
  assert.match(found.note!, /No policy named: DEMO-SEM-5Y/);
  assert.equal(pickPolicy({ ...base, months: 36 }, policies).policy?.code, 'DEMO-ISZ-3Y', 'archived policies are never found from the terms');
  assert.match(pickPolicy({ ...base, months: 24 }, policies).error!, /No vehicle warranty policy in EJO has 24 months/);
  assert.match(pickPolicy({ ...base, months: 36 }, [...policies, pol({ code: 'DEMO-ISZ-3Y-B' })]).error!, /2 vehicle policies have 36 months .*name the policy/);
  assert.match(pickPolicy({ ...base, months: 36, provider: 'Someone else' }, policies).error!, /from Someone else/);
});

const CH = ['CLMNO', 'MGANR', 'Stage', 'REPDA', 'Odometer', 'Complaint', 'Cause', 'Correction', 'Causal part', 'Causal part number', 'Labour', 'Parts', 'Other', 'Logistics', 'Claimed', 'Accepted amount', 'Provider reference', 'Submitted on', 'Decided on', 'Remedy', 'Part return', 'Notes'];
const cm = autoMap('claims', CH);
const crow = (o: Partial<Record<(typeof CH)[number], string>>) => CH.map((h) => o[h] ?? '');
const full = { CLMNO: 'C-2026-0184', MGANR: 'B-2026-0002', REPDA: '15.10.2026', Complaint: 'Will not start', Cause: 'Cell short', Correction: 'Battery replaced', 'Causal part': 'Battery', 'Causal part number': '8-98100017-7', Labour: '5000', Parts: '170000', 'Provider reference': 'OAE-1', 'Submitted on': '17.10.2026' };

test('a claim row: the three Cs, amounts that add up, the provider’s decision, the failed part; refusals', () => {
  assert.deepEqual(mappingProblems('claims', cm), []);
  assert.deepEqual(mappingProblems('claims', { ...cm, warrantyNumber: null, vin: null, plateNumber: null }), ['Choose how to find each claim’s warranty: its warranty number, or the vehicle’s chassis number or plate.']);
  const sub = checkClaimRow(crow({ ...full, Stage: 'Submitted', 'Part return': 'Sent' }), cm, TODAY);
  assert.equal(sub.status, 'GOOD', JSON.stringify(sub.issues));
  const v = sub.values!;
  assert.equal(v.stage, 'SUBMITTED');
  assert.equal(v.claimedAmount, 175000);
  assert.equal(v.approvedAmount, null);
  assert.deepEqual(v.partReturn, { required: true, status: 'SENT' });
  assert.equal(v.submittedOn, '2026-10-17');
  assert.deepEqual(sub.keys, ['claim:C-2026-0184']);
  // Accepted with no amount: the whole claim. Partially accepted: the amount is needed.
  const acc = checkClaimRow(crow({ ...full, Stage: 'Accepted', 'Decided on': '20.10.2026' }), cm, TODAY);
  assert.equal(acc.values?.approvedAmount, 175000);
  assert.match(acc.issues.map((i) => i.message).join(' '), /the full claim \(₦175,000\) is taken as accepted/);
  const err = (o: Partial<Record<(typeof CH)[number], string>>) => checkClaimRow(crow({ ...full, ...o }), cm, TODAY).issues.filter((i) => i.level === 'error').map((i) => i.message);
  assert.deepEqual(err({ Stage: 'Partially accepted' }), ['Partially accepted: give the amount the provider accepted.']);
  assert.match(err({ Stage: 'Settled' })[0]!, /a settled or cancelled claim is history/);
  assert.match(err({ Stage: 'Somewhere' })[0]!, /is not a claim stage EJO knows/);
  assert.deepEqual(err({ Complaint: '' }), ['The complaint is required: what the customer reported.']);
  assert.match(err({ REPDA: '15.03.2027' })[0]!, /is in the future/);
  assert.match(err({ MGANR: '' })[0]!, /Which warranty is it on\?/);
  // A total that disagrees with its parts: the parts are kept. Only a total: kept as "Other".
  const odd = checkClaimRow(crow({ ...full, Stage: 'Submitted', Claimed: '999999' }), cm, TODAY);
  assert.equal(odd.values?.claimedAmount, 175000);
  const total = checkClaimRow(crow({ ...full, Stage: 'Draft', Labour: '', Parts: '', Claimed: '50000' }), cm, TODAY);
  assert.equal(total.values?.claimedAmount, 50000);
  assert.equal(total.values?.otherAmount, 50000);
  // Past the draft with no cause or correction: the claim says so, to be filled in before it goes to the provider.
  const thin = checkClaimRow(crow({ ...full, Stage: 'With the Manager', Cause: '', Correction: '' }), cm, TODAY);
  assert.equal(thin.values?.cause, NOT_RECORDED);
  assert.equal(thin.status, 'WARNING');
  // A decision date before the submission falls back.
  assert.equal(checkClaimRow(crow({ ...full, Stage: 'Rejected', Notes: 'Impact damage', 'Decided on': '16.10.2026' }), cm, TODAY).values?.decidedOn, null);
});

test('wired in: old numbers kept, the import’s two people register and verify, approvals before EJO dated not replayed, nobody emailed, undo to the bin only', () => {
  const server = read('lib/data-exchange/warranties-server.ts');
  assert.match(server, /externalSource: range, externalId: v\.warrantyNumber, importJobId: job\.id/);
  assert.match(server, /externalSource: range, externalId: v\.claimNumber, importJobId: job\.id/);
  assert.match(server, /origin: 'IMPORT'/);
  assert.match(server, /issuedById: job\.createdById, issuedAt: start, verifiedById: job\.approvedById/, 'the two-person rule: who ran it registers, who approved it verifies');
  assert.match(server, /hodApprovedAt: atOrPast\(s, 'PENDING_MANAGER'\) \? failure : null/);
  assert.doesNotMatch(server, /hodApprovedById|managerApprovedById|submittedById|decidedById/, 'no EJO person is named for a step taken before EJO');
  assert.doesNotMatch(server, /sendEmail|notify|mailer/i, 'nobody is emailed');
  // Undo: any audited step since the load keeps a record out of the bin, however soon after (no grace minute).
  for (const e of ['Warranty', 'WarrantyClaim']) assert.match(server, new RegExp(`db\\.auditLog\\.count\\(\\{ where: \\{ entityType: '${e}', entityId: id \\} \\}\\)`));
  assert.doesNotMatch(server, /60_000/);
  assert.match(server, /recycleBinItem\.findFirst\(\{ where: \{ entityType: kind === 'WR' \? 'Warranty' : 'WarrantyClaim'/, 'numbers held in the bin are never given out again');
  const dx = read('lib/actions/data-exchange.ts');
  assert.match(dx, /moveImportedWarrantyRecordsToBinInTx\(tx, entity === 'warranties' \? 'Warranty' : 'WarrantyClaim', quiet, job\.id/);
  assert.match(dx, /warranties: \['wty'\], claims: \['claim'\]/);
  for (const f of ['lib/actions/warranty.ts', 'lib/actions/warranty-claims.ts']) assert.match(read(f), /recycleBinItem\.findFirst\(\{ where: \{ entityType: 'Warranty(Claim)?'/, `${f}: the desk’s numbers skip binned ones too`);
  // Approved by the warranty chain, never by the workshop alone; loads after vehicles, claims after warranties.
  assert.equal(ENTITIES.warranties.needs, 'warranty.claim.approve');
  assert.equal(ENTITIES.claims.needs, 'warranty.claim.approve');
  assert.equal(ENTITIES.warranties.after, 'vehicles');
  assert.equal(ENTITIES.claims.after, 'warranties');
  // Never by hand: only an undone import puts a warranty or a claim in the bin.
  assert.equal(DATA_INVENTORY.Warranty?.recycleBin, 'IMPORT_UNDO');
  assert.equal(DATA_INVENTORY.WarrantyClaim?.recycleBin, 'IMPORT_UNDO');
  const bin = read('lib/recycle-bin/server.ts');
  assert.match(bin, /case 'Warranty': return \(await db\.warranty\.count\(\{ where: \{ id \} \}\)\) \? warrantyRecordEligibility\('Warranty'\)/);
  assert.match(bin, /importJobId, claims: \{ none: \{\} \}/, 'a warranty with a claim on it stays');
  // Banners on the warranty and the claim; search by the old number.
  assert.match(read('app/(app)/warranty/[id]/page.tsx'), /data-testid="warranty-origin"/);
  assert.match(read('app/(app)/warranty/claims/[id]/page.tsx'), /data-testid="claim-origin"/);
  assert.match(read('lib/actions/search.ts'), /warranty \$\{w\.externalId\} → \$\{w\.warrantyNumber\}/);
  for (const f of ['scripts/predeploy/0019-warranty-imports.sql', 'scripts/v-p6-warranty-imports.sql']) {
    const sql = read(`../../${f}`);
    for (const t of ['warranties', 'warranty_claims']) assert.match(sql, new RegExp(`ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "externalId" TEXT`));
    assert.doesNotMatch(sql, /^\s*(DROP|DELETE|TRUNCATE|UPDATE) /im, 'additive only');
  }
});

test('search: an old number that looks like the start of an EJO reference still finds the SAP record; a complete EJO reference does not ask', () => {
  const sapAsked = (q: string) => { const p = planSearch(q); return p.kind !== 'prefix' && !(p.kind === 'reference' && p.textScope === 'none') && Boolean(sapNumberQuery(q)); };
  for (const q of ['W-2024-0412', 'C-2026-0184', 'B-2026-0001', '483203', 'BK-2026-0600']) assert.equal(sapAsked(q), true, q);
  for (const q of ['WR-2026-000031', 'WC-2026-000004', 'WR']) assert.equal(sapAsked(q), false, q);
  assert.match(read('lib/actions/search.ts'), /const sapFits = plan\.kind !== 'prefix' && !\(plan\.kind === 'reference' && plan\.textScope === 'none'\);/);
});
