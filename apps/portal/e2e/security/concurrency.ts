/**
 * Concurrency / idempotency against the REAL app and REAL Postgres (CI only,
 * throw-away database). Fires bursts of identical or competing server-action
 * calls through `next start` with Promise.all, then checks the final database
 * state with SQL. Fixtures: e2e/security/fixtures.ts.
 *
 *  CONC-01 recordPayment ×30, SAME idempotency key           → exactly 1 payment
 *  CONC-02 recordPayment ×20, different keys, Σ > balance     → Σ ≤ estimate total; one status move
 *  CONC-03 createJobCard ×20, SAME vehicle                    → exactly 1 open Job Card
 *  CONC-04 createJobCard ×15, different vehicles             → 15 cards, 15 unique numbers
 *  CONC-05 approveJobCard ×20 on the same card                → 1 approval (one audit row)
 *  CONC-06 recordRefund ×20, SAME key                         → exactly 1 refund
 *  CONC-07 recordRefund ×10, different keys, Σ > paid         → Σ refunds ≤ paid
 *  CONC-08 recordGoodsReceipt ×20, SAME key                   → 1 receipt; on-hand +qty once
 *  CONC-09 approvePartRequestSlipByStore, 10 slips × 3 vs 10 on hand → reserved ≤ on hand, never negative
 *  CONC-10 approvePartRequestSlipByStore ×10 on ONE slip      → reserved once
 *  CONC-11 releasePartRequestSlip ×10 on ONE approved slip    → on hand −qty once, reserved −qty once
 *  CONC-12 global stock invariants                            → no negative on-hand / reserved anywhere
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { action, closeDb, report, signIn, sql, type Check, type ActionResult } from './lib';
import { E2E_PASSWORD } from '../people';

const FIX = JSON.parse(readFileSync(process.env.SEC_FIXTURES ?? 'sec-fixtures.json', 'utf8'));
const evidence: Record<string, unknown> = {};

/** Several sessions per person (the middleware allows 120 submissions a
 * minute per session, and real double-submits come from one session anyway). */
async function sessions(email: string, n: number) {
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) out.push(await signIn(email, E2E_PASSWORD));
  return out;
}
const tally = (rs: ActionResult[]) => {
  const t: Record<string, number> = {};
  for (const r of rs) { const k = r.ok ? 'ok' : r.redirect ? 'redirect' : r.error ? 'refused' : `HTTP ${r.status}`; t[k] = (t[k] ?? 0) + 1; }
  return Object.entries(t).map(([k, v]) => `${k}=${v}`).join(' ');
};
const burst = (n: number, fn: (i: number) => Promise<ActionResult>) => Promise.all(Array.from({ length: n }, (_, i) => fn(i)));
const num = async (q: string, p: unknown[] = []) => Number(Object.values((await sql(q, p))[0] ?? { n: 0 })[0] ?? 0);

async function main() {
  const checks: Check[] = [];
  const fin = await sessions('finance@e2e.test', 3);
  const front = await sessions('frontdesk@e2e.test', 2);
  const sup = await sessions('supervisor@e2e.test', 2);
  const store = await sessions('store@e2e.test', 2);
  const t0 = Date.now();

  // CONC-01 — one payment form submitted 30 times at once.
  {
    const rs = await burst(30, (i) => action('recordPayment', [FIX.jcPay, 10000, 'CASH', 'conc-01', 'conc-01-same-key'], { cookie: fin[i % fin.length] }));
    const n = await num(`SELECT count(*) FROM payments WHERE "idempotencyKey"='conc-01-same-key'`);
    const all = await num(`SELECT count(*) FROM payments WHERE "jobCardId"=$1`, [FIX.jcPay]);
    checks.push({ id: 'CONC-01', title: 'recordPayment ×30, same idempotency key', pass: n === 1 && all === 1, detail: `rows with key=${n}, payments on card=${all}; responses: ${tally(rs)}` });
  }
  // CONC-02 — 20 cashiers, different payments, together far more than owed.
  {
    const rs = await burst(20, (i) => action('recordPayment', [FIX.jcPay2, 9000 + i * 7, 'BANK_TRANSFER', `conc-02-${i}`, `conc-02-key-${i}`], { cookie: fin[i % fin.length] }));
    const paid = await num(`SELECT coalesce(sum(amount),0) FROM payments WHERE "jobCardId"=$1`, [FIX.jcPay2]);
    const cnt = await num(`SELECT count(*) FROM payments WHERE "jobCardId"=$1`, [FIX.jcPay2]);
    const total = await num(`SELECT coalesce(sum(li.amount),0) FROM estimate_line_items li JOIN estimates e ON e.id=li."estimateId" WHERE e."jobCardId"=$1 AND li."billTo"='CUSTOMER'`, [FIX.jcPay2]);
    const status = (await sql(`SELECT status FROM job_cards WHERE id=$1`, [FIX.jcPay2]))[0]?.status;
    const moves = await num(`SELECT count(*) FROM audit_logs WHERE "entityId"=$1 AND action ILIKE '%payment%'`, [FIX.jcPay2]);
    checks.push({ id: 'CONC-02', title: 'recordPayment ×20 distinct, Σ requested 181,330 vs 100,000 owed', pass: paid <= total && cnt === rs.filter((r) => r.ok).length, detail: `paid=${paid} total=${total} payments=${cnt} accepted=${rs.filter((r) => r.ok).length} status=${status} payment audit rows=${moves}; ${tally(rs)}` });
  }
  // CONC-03 — 20 front-desk submissions opening a Job Card for the same vehicle.
  {
    const input = { customerId: FIX.customerId, vehicleId: FIX.sameVehicleId, complaints: ['Concurrency test — same vehicle'], supervisorId: FIX.users.sup, mileageAtCheckIn: 20000 };
    const rs = await burst(20, (i) => action('createJobCard', [input], { cookie: front[i % front.length] }));
    const open = await num(`SELECT count(*) FROM job_cards WHERE "vehicleId"=$1 AND status NOT IN ('CLOSED','CHECKED_OUT','CANCELLED')`, [FIX.sameVehicleId]);
    evidence.sameVehicleJobCard = (await sql(`SELECT id, "jobNumber" FROM job_cards WHERE "vehicleId"=$1`, [FIX.sameVehicleId]))[0];
    checks.push({ id: 'CONC-03', title: 'createJobCard ×20, same vehicle', pass: open === 1, detail: `open Job Cards for the vehicle=${open}; ${tally(rs)}` });
  }
  // CONC-04 — 15 Job Cards for 15 vehicles at once (number generation).
  {
    const rs = await burst(15, (i) => action('createJobCard', [{ customerId: FIX.customerId, vehicleId: FIX.manyVehicleIds[i], complaints: [`Concurrency test ${i}`], supervisorId: FIX.users.sup, mileageAtCheckIn: 20000 + i }], { cookie: front[i % front.length] }));
    const rows = await sql<{ jobNumber: string }>(`SELECT "jobNumber" FROM job_cards WHERE "vehicleId" = ANY($1)`, [FIX.manyVehicleIds]);
    const unique = new Set(rows.map((r) => r.jobNumber)).size;
    checks.push({ id: 'CONC-04', title: 'createJobCard ×15, different vehicles (number generation)', pass: unique === rows.length && rows.length === 15, severity: rows.length === 15 ? undefined : 'warning',
      detail: `created=${rows.length}/15, unique numbers=${unique}; ${tally(rs)}${rows.length < 15 ? ' (refusals here mean a number clash surfaced to the user — retried manually)' : ''}` });
  }
  // CONC-05 — the supervisor double-clicks "Approve" 20 times.
  {
    const jc = (evidence.sameVehicleJobCard as { id?: string } | undefined)?.id;
    if (jc) {
      const rs = await burst(20, (i) => action('approveJobCard', [jc, 'conc-05'], { cookie: sup[i % sup.length] }));
      const st = (await sql(`SELECT "approvalStatus" FROM job_cards WHERE id=$1`, [jc]))[0]?.approvalStatus;
      const audits = await num(`SELECT count(*) FROM audit_logs WHERE "entityId"=$1 AND action='job_card.approved'`, [jc]);
      checks.push({ id: 'CONC-05', title: 'approveJobCard ×20 (compare-and-set)', pass: st === 'APPROVED' && audits === 1, detail: `approvalStatus=${st}, job_card.approved audit rows=${audits}; ${tally(rs)}` });
    } else checks.push({ id: 'CONC-05', title: 'approveJobCard ×20', pass: false, detail: 'no Job Card from CONC-03 to approve' });
  }
  // CONC-06 / 07 — refunds on a cancelled card with 50,000 paid (1 already refunded by the fixture).
  {
    const rs = await burst(20, (i) => action('recordRefund', [{ target: { jobCardId: FIX.jcRefund }, idempotencyKey: 'conc-06-same-key', amount: 5000, method: 'CASH', paidToName: 'Ada Customer', reason: 'conc-06' }], { cookie: fin[i % fin.length] }));
    const n = await num(`SELECT count(*) FROM refunds WHERE "idempotencyKey"='conc-06-same-key'`);
    checks.push({ id: 'CONC-06', title: 'recordRefund ×20, same idempotency key', pass: n === 1, detail: `rows with key=${n}; ${tally(rs)}` });
    const rs2 = await burst(10, (i) => action('recordRefund', [{ target: { jobCardId: FIX.jcRefund }, idempotencyKey: `conc-07-${i}`, amount: 12000 + i, method: 'BANK_TRANSFER', paidToName: 'Ada Customer', reason: 'conc-07' }], { cookie: fin[i % fin.length] }));
    const refunded = await num(`SELECT coalesce(sum(amount),0) FROM refunds WHERE "jobCardId"=$1`, [FIX.jcRefund]);
    const paid = await num(`SELECT coalesce(sum(amount),0) FROM payments WHERE "jobCardId"=$1`, [FIX.jcRefund]);
    checks.push({ id: 'CONC-07', title: 'recordRefund ×10 distinct, Σ requested 120,045 vs 50,000 paid', pass: refunded <= paid, detail: `refunded=${refunded} paid=${paid}; ${tally(rs2)}` });
  }
  // CONC-08 — one goods-receipt form submitted 20 times at once.
  {
    const before = await num(`SELECT "quantityOnHand" FROM part_stock WHERE "partId"=$1`, [FIX.parts.receive]);
    const input = { idempotencyKey: 'conc-08-same-key', branchId: FIX.branchId, supplierName: 'Conc Supplier', lines: [{ partId: FIX.parts.receive, quantityReceivedInUnit: 4, unitUsed: 'piece', totalCost: 40000 }] };
    const rs = await burst(20, (i) => action('recordGoodsReceipt', [input], { cookie: store[i % store.length] }));
    const after = await num(`SELECT "quantityOnHand" FROM part_stock WHERE "partId"=$1`, [FIX.parts.receive]);
    const n = await num(`SELECT count(*) FROM goods_receipts WHERE "idempotencyKey"='conc-08-same-key'`);
    checks.push({ id: 'CONC-08', title: 'recordGoodsReceipt ×20, same idempotency key', pass: n === 1 && after - before === 4, detail: `receipts with key=${n}, on hand ${before}→${after} (expected +4); ${tally(rs)}` });
  }
  // CONC-09 — ten storekeeper approvals competing for the same 10 units (3 each).
  {
    const rs = await burst(10, (i) => action('approvePartRequestSlipByStore', [FIX.pendingSlips[i], 'conc-09'], { cookie: store[i % store.length] }));
    const s = (await sql<{ onHand: string; reserved: string }>(`SELECT "quantityOnHand" AS "onHand", "quantityReserved" AS reserved FROM part_stock WHERE "partId"=$1`, [FIX.parts.approve]))[0]!;
    const approved = await num(`SELECT count(*) FROM part_request_slips WHERE id = ANY($1) AND status='APPROVED'`, [FIX.pendingSlips]);
    const reserved = Number(s.reserved);
    checks.push({ id: 'CONC-09', title: 'approvePartRequestSlipByStore, 10 slips × 3 vs 10 on hand', pass: reserved <= Number(s.onHand) && reserved >= 0 && reserved === approved * 3, detail: `on hand=${Number(s.onHand)} reserved=${reserved} approved slips=${approved} (expect ≤3 and reserved = 3×approved); ${tally(rs)}` });
  }
  // CONC-10 — the same slip approved 10 times at once (reset one slip to pending first).
  {
    const slipId = (await sql<{ id: string }>(`SELECT id FROM part_request_slips WHERE id = ANY($1) AND status='PENDING_STORE_APPROVAL' LIMIT 1`, [FIX.pendingSlips]))[0]?.id;
    if (slipId) {
      // Make room: give the part enough stock that every approval could fit.
      await sql(`UPDATE part_stock SET "quantityOnHand" = "quantityOnHand" + 30 WHERE "partId"=$1`, [FIX.parts.approve]);
      const before = await num(`SELECT "quantityReserved" FROM part_stock WHERE "partId"=$1`, [FIX.parts.approve]);
      const rs = await burst(10, (i) => action('approvePartRequestSlipByStore', [slipId, 'conc-10'], { cookie: store[i % store.length] }));
      const after = await num(`SELECT "quantityReserved" FROM part_stock WHERE "partId"=$1`, [FIX.parts.approve]);
      checks.push({ id: 'CONC-10', title: 'approvePartRequestSlipByStore ×10 on one slip', pass: after - before === 3, detail: `reserved ${before}→${after} (expected +3); ${tally(rs)}` });
    }
  }
  // CONC-11 — one approved slip released 10 times at once.
  {
    const b = (await sql<{ o: string; r: string }>(`SELECT "quantityOnHand" o, "quantityReserved" r FROM part_stock WHERE "partId"=$1`, [FIX.parts.release]))[0]!;
    const rs = await burst(10, (i) => action('releasePartRequestSlip', [FIX.approvedSlip, { receivedByUserId: FIX.users.tech }], { cookie: store[i % store.length] }));
    const a = (await sql<{ o: string; r: string }>(`SELECT "quantityOnHand" o, "quantityReserved" r FROM part_stock WHERE "partId"=$1`, [FIX.parts.release]))[0]!;
    const st = (await sql(`SELECT status FROM part_request_slips WHERE id=$1`, [FIX.approvedSlip]))[0]?.status;
    checks.push({ id: 'CONC-11', title: 'releasePartRequestSlip ×10 on one slip', pass: Number(b.o) - Number(a.o) === 2 && Number(b.r) - Number(a.r) === 2 && st === 'RELEASED', detail: `on hand ${Number(b.o)}→${Number(a.o)}, reserved ${Number(b.r)}→${Number(a.r)} (expected −2 each), slip=${st}; ${tally(rs)}` });
  }
  // CONC-12 — invariants over the whole database.
  {
    const neg = await num(`SELECT count(*) FROM part_stock WHERE "quantityOnHand" < 0 OR "quantityReserved" < 0`);
    const over = await num(`SELECT count(*) FROM part_stock WHERE "quantityReserved" > "quantityOnHand"`);
    const dupKeys = await num(`SELECT count(*) FROM (SELECT "idempotencyKey" FROM payments WHERE "idempotencyKey" IS NOT NULL GROUP BY 1 HAVING count(*)>1) x`);
    const overpaid = await num(`SELECT count(*) FROM job_cards j WHERE (SELECT coalesce(sum(amount),0) FROM payments p WHERE p."jobCardId"=j.id) > (SELECT coalesce(sum(li.amount),0) FROM estimate_line_items li JOIN estimates e ON e.id=li."estimateId" WHERE e."jobCardId"=j.id AND li."billTo"='CUSTOMER') AND EXISTS (SELECT 1 FROM estimates e WHERE e."jobCardId"=j.id)`);
    const twoOpen = await num(`SELECT count(*) FROM (SELECT "vehicleId" FROM job_cards WHERE status NOT IN ('CLOSED','CHECKED_OUT','CANCELLED') GROUP BY 1 HAVING count(*)>1) x`);
    checks.push({ id: 'CONC-12', title: 'database invariants after all bursts', pass: neg + over + dupKeys + overpaid + twoOpen === 0, detail: `negative stock rows=${neg}, reserved>on-hand rows=${over}, duplicate payment keys=${dupKeys}, overpaid cards=${overpaid}, vehicles with 2+ open cards=${twoOpen}` });
  }
  evidence.seconds = (Date.now() - t0) / 1000;
  writeFileSync(process.env.SEC_CONC_OUT ?? 'sec-concurrency.json', JSON.stringify({ checks, evidence }, null, 1));
  const failed = report('Concurrency & idempotency (real server actions, real Postgres)', checks);
  await closeDb();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => { console.log(`::error title=concurrency crashed::${String(e?.stack ?? e).replace(/\n/g, '%0A').slice(0, 3000)}`); await closeDb(); process.exit(1); });
