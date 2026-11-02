/**
 * Data Exchange — checking one row of the open job cards file (P5): the job
 * cards still in the workshop on the cut-over day, each to become a live EJO
 * job card. Pure, like check.ts; the server part (open-jobs-server.ts) finds
 * the customer, the vehicle, the staff and the parts.
 */
import { cellText, phoneKey, vinKey, type Checked, type Issue } from './check';
import { parseAmount } from './check-inventory';
import { lagosToday, parseDay } from './dates';
import type { Mapping } from './fields';
import { parseKm } from './check-history';

function get(cells: unknown[], mapping: Mapping, key: string): string {
  const i = mapping[key];
  return typeof i === 'number' ? cellText(cells[i]) : '';
}

/** EJO's stages an open job card can be brought in at (never closed, checked out or cancelled: those are history). */
export type OpenJobStage = 'CHECKED_IN' | 'IN_PROGRESS' | 'AWAITING_PARTS' | 'QUALITY_CHECK' | 'AWAITING_CUSTOMER_APPROVAL' | 'COMPLETED' | 'READY_FOR_COLLECTION';
export const OPEN_JOB_STAGE_WORDS: Record<OpenJobStage, string> = {
  CHECKED_IN: 'Checked in', IN_PROGRESS: 'In progress', AWAITING_PARTS: 'Awaiting parts', QUALITY_CHECK: 'Quality check', AWAITING_CUSTOMER_APPROVAL: 'Awaiting customer approval', COMPLETED: 'Completed', READY_FOR_COLLECTION: 'Ready for collection',
};

/**
 * The stage, from EJO's own words or SAP's statuses (system status ISTAT /
 * user status): CRTD → checked in; REL, "in progress", "WIP" → in progress;
 * "awaiting parts", MATS → awaiting parts; QC / "quality" → quality check;
 * "awaiting customer", "estimate sent", "quotation" → awaiting customer
 * approval; TECO, "completed" → completed; "ready", "for collection",
 * "invoiced" → ready for collection. Empty → checked in. Returns
 * 'CLOSED' for anything closed, checked out or cancelled (history, not
 * here) and null for words it does not know.
 */
export function openJobStage(raw: string): OpenJobStage | 'CLOSED' | null {
  const k = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (!k) return 'CHECKED_IN';
  if (/clsd|closed|checkedout|collected|delivered|cancel|cncl|dlfl|void/.test(k)) return 'CLOSED';
  if (/awaitingcustomer|waitingcustomer|customerapproval|estimatesent|quotation|quote|awaitingapproval/.test(k)) return 'AWAITING_CUSTOMER_APPROVAL';
  if (/awaitingparts|waitingparts|waitingforparts|parts|mats|material|backorder|onhold/.test(k)) return 'AWAITING_PARTS';
  if (/^qc|quality|inspection|finalcheck|roadtest/.test(k)) return 'QUALITY_CHECK';
  if (/ready|forcollection|awaitingcollection|invoiced|billed/.test(k)) return 'READY_FOR_COLLECTION';
  if (/teco|complete|completed|done|finished|workdone/.test(k)) return 'COMPLETED';
  if (/^rel|released|inprogress|inprocess|wip|working|workinprogress|assigned|started|underrepair|inworkshop/.test(k)) return 'IN_PROGRESS';
  if (/^crtd|created|checkedin|checkin|received|new|open|booked|opened|registered/.test(k)) return 'CHECKED_IN';
  return null;
}

export type IssuedPart = { text: string; partNumber: string | null; quantity: number; unitPrice: number | null; amount: number | null };

/** "8-97366-430-0 x2 @45000; Oil filter x1 @6500" → one item per ";" or line: a part number (digits and dashes) or a name, a quantity after x/× (1 when none), a unit price after @. */
export function parseIssuedParts(raw: string): { items: IssuedPart[]; problems: string[] } {
  const items: IssuedPart[] = [];
  const problems: string[] = [];
  for (const piece of String(raw ?? '').split(/;|\n/).map((x) => x.trim()).filter(Boolean)) {
    const m = /^(.*?)(?:\s*[x×*]\s*(\d+(?:[.,]\d+)?))?(?:\s*@\s*([\d.,]+(?:\s*-)?))?\s*$/i.exec(piece);
    const text = (m?.[1] ?? piece).trim().replace(/[,;]+$/, '');
    if (!text) { problems.push(`“${piece}” has no part.`); continue; }
    const quantity = m?.[2] ? Number(m[2].replace(',', '.')) : 1;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10_000) { problems.push(`“${piece}”: the quantity is not a number.`); continue; }
    const unitPrice = m?.[3] ? parseAmount(m[3]) : null;
    if (m?.[3] && unitPrice === null) problems.push(`“${piece}”: the price after @ is not an amount.`);
    const partNumber = /^[A-Z0-9][A-Z0-9\-./]{2,}$/i.test(text) && /\d/.test(text) ? text.toUpperCase() : null;
    items.push({ text, partNumber, quantity, unitPrice, amount: unitPrice === null ? null : Math.round(unitPrice * quantity * 100) / 100 });
  }
  return { items, problems };
}

export type OpenJobValues = {
  jobNumber: string;
  customer: { externalId: string | null; phone: string | null; email: string | null };
  vin: string | null;
  vinKey: string | null;
  plate: string | null;
  plateKey: string | null;
  openedAt: string;
  stage: OpenJobStage;
  mileage: number | null;
  complaints: string[];
  diagnosis: string | null;
  technician: string | null;
  supervisor: string | null;
  labourAmount: number | null;
  partsAmount: number | null;
  estimateTotal: number | null;
  estimateApproved: boolean;
  partsIssued: IssuedPart[];
  paidAmount: number | null;
  paymentMethod: 'BANK_TRANSFER' | 'CASH';
  paymentReference: string | null;
  paidOn: string | null;
  notes: string | null;
  branch: string | null;
};

export function checkOpenJobRow(cells: unknown[], mapping: Mapping, today = lagosToday()): Checked<OpenJobValues> {
  const issues: Issue[] = [];
  const warn = (field: string, message: string) => issues.push({ field, message, level: 'warning' });
  const fail = (field: string, message: string) => issues.push({ field, message, level: 'error' });

  const jobNumber = get(cells, mapping, 'jobNumber').replace(/^0+(?=\d)/, '');
  if (!jobNumber) fail('jobNumber', 'Job number is required (the SAP order number, AUFNR, or the old job card number).');
  else if (jobNumber.length > 40) fail('jobNumber', 'The job number is longer than 40 characters.');

  const openedRaw = get(cells, mapping, 'openedAt');
  const openedAt = parseDay(openedRaw);
  if (!openedRaw) fail('openedAt', 'Opened on is required (SAP ERDAT).');
  else if (!openedAt) fail('openedAt', `“${openedRaw}” is not a date. Write it as 14.03.2019, 14/03/2019, 2019-03-14 or 20190314.`);
  else if (openedAt > today) fail('openedAt', `The opening date ${openedAt} is in the future.`);
  else if (Number(today.slice(0, 4)) - Number(openedAt.slice(0, 4)) > 1) warn('openedAt', `Opened ${openedAt}: more than a year in the workshop? Check the date.`);

  const stageRaw = get(cells, mapping, 'status');
  const stage = openJobStage(stageRaw);
  if (stage === 'CLOSED') fail('status', `Stage “${stageRaw}”: a closed, checked-out or cancelled job card belongs in the job card history file, not here.`);
  else if (!stage) fail('status', `“${stageRaw}” is not a stage EJO knows: use Checked in, In progress, Awaiting parts, Quality check, Awaiting customer approval, Completed or Ready for collection (or SAP’s CRTD, REL, TECO).`);

  const custExt = get(cells, mapping, 'customerExternalId').replace(/^0+(?=\d)/, '') || null;
  const custPhone = phoneKey(get(cells, mapping, 'customerPhone'));
  const custEmail = get(cells, mapping, 'customerEmail').trim().toLowerCase() || null;
  const vinRaw = get(cells, mapping, 'vin');
  const vk = vinKey(vinRaw);
  if (vk && (vk.length < 6 || vk.length > 25)) fail('vin', `“${vinRaw}” does not look like a chassis number.`);
  const plateRaw = get(cells, mapping, 'plateNumber');
  const plateKey = plateRaw ? plateRaw.toUpperCase().replace(/[\s-]/g, '') : null;
  if (!vk && !plateKey) fail('vin', 'Which vehicle is it? Give the chassis number (VIN) or the plate: an open job card is on a vehicle that is in EJO.');

  const mileageRaw = get(cells, mapping, 'mileage');
  const mileage = mileageRaw ? parseKm(mileageRaw) : null;
  if (mileageRaw && mileage === null) warn('mileage', `Mileage “${mileageRaw}” is not a number of kilometres, so it was left out.`);

  const complaintRaw = get(cells, mapping, 'complaint');
  let complaints = complaintRaw.split(/;|\n/).map((x) => x.trim()).filter(Boolean).slice(0, 10).map((x) => x.slice(0, 500));
  if (!complaints.length) { warn('complaint', 'No complaint written: the job card reads “Brought in from the old system; see the old job card.”'); complaints = ['Brought in from the old system; see the old job card.']; }
  const diagnosis = get(cells, mapping, 'diagnosis').slice(0, 2000) || null;
  const technician = get(cells, mapping, 'technician').slice(0, 80) || null;
  const supervisor = get(cells, mapping, 'supervisor').slice(0, 80) || null;

  const money = (key: string, label: string): number | null => {
    const raw = get(cells, mapping, key);
    if (!raw) return null;
    const n = parseAmount(raw);
    if (n === null) { warn(key, `${label} “${raw}” is not an amount, so it was left out.`); return null; }
    if (n < 0) { warn(key, `${label} is negative; left out.`); return null; }
    if (n > 10_000_000_000) { warn(key, `${label} is larger than ₦10 billion; left out (a document number?).`); return null; }
    return Math.round(n * 100) / 100;
  };
  const labourAmount = money('labourAmount', 'Labour');
  const partsAmount = money('partsAmount', 'Parts');
  let estimateTotal = money('estimateTotal', 'The estimate total');
  if (estimateTotal === null && (labourAmount !== null || partsAmount !== null)) estimateTotal = Math.round(((labourAmount ?? 0) + (partsAmount ?? 0)) * 100) / 100;
  if (estimateTotal !== null && labourAmount !== null && partsAmount !== null && Math.abs(estimateTotal - labourAmount - partsAmount) > 0.5) warn('estimateTotal', `The estimate total (₦${estimateTotal.toLocaleString('en-NG')}) is not labour plus parts (₦${(labourAmount + partsAmount).toLocaleString('en-NG')}); the total is kept as given.`);
  const approvedRaw = get(cells, mapping, 'estimateApproved').toLowerCase().replace(/[^a-z]/g, '');
  const estimateApproved = approvedRaw ? ['yes', 'y', 'true', 'approved', 'x', 'ok'].includes(approvedRaw) : estimateTotal !== null;
  if (approvedRaw && !['yes', 'y', 'true', 'approved', 'x', 'ok', 'no', 'n', 'false', 'pending', 'notyet'].includes(approvedRaw)) warn('estimateApproved', `“${get(cells, mapping, 'estimateApproved')}” is not Yes or No; read as ${estimateApproved ? 'Yes' : 'No'}.`);
  if (stage === 'AWAITING_CUSTOMER_APPROVAL' && estimateApproved && approvedRaw) warn('estimateApproved', 'The stage says the customer has not approved yet, but the estimate is marked approved; the job card waits for the customer.');

  const issuedRaw = get(cells, mapping, 'partsIssued');
  const parsed = issuedRaw ? parseIssuedParts(issuedRaw) : { items: [], problems: [] };
  for (const p of parsed.problems) warn('partsIssued', `Parts issued: ${p}`);
  const issuedTotal = parsed.items.reduce((s, i) => s + (i.amount ?? 0), 0);
  if (partsAmount !== null && issuedTotal > partsAmount + 0.5) warn('partsIssued', `The parts issued add up to ₦${issuedTotal.toLocaleString('en-NG')}, more than the parts estimate of ₦${partsAmount.toLocaleString('en-NG')}; both are kept as given.`);

  const paidAmount = money('paidAmount', 'Paid so far');
  if (paidAmount !== null && estimateTotal !== null && paidAmount > estimateTotal + 0.5) warn('paidAmount', `Paid ₦${paidAmount.toLocaleString('en-NG')} is more than the estimate ₦${estimateTotal.toLocaleString('en-NG')}; kept as given (the job card shows the credit).`);
  const methodRaw = get(cells, mapping, 'paymentMethod').toLowerCase().replace(/[^a-z]/g, '');
  const paymentMethod: 'BANK_TRANSFER' | 'CASH' = /cash/.test(methodRaw) ? 'CASH' : 'BANK_TRANSFER';
  if (methodRaw && !/cash|transfer|bank|pos|card|cheque|check|online/.test(methodRaw)) warn('paymentMethod', `“${get(cells, mapping, 'paymentMethod')}” is not Bank transfer or Cash; recorded as a bank transfer.`);
  const paymentReference = get(cells, mapping, 'paymentReference').slice(0, 80) || null;
  const paidOnRaw = get(cells, mapping, 'paidOn');
  let paidOn = paidOnRaw ? parseDay(paidOnRaw) : null;
  if (paidOnRaw && !paidOn) { warn('paidOn', `Paid on “${paidOnRaw}” is not a date; the opening date is used.`); paidOn = null; }
  else if (paidOn && paidOn > today) { warn('paidOn', `Paid on ${paidOn} is in the future; the opening date is used.`); paidOn = null; }
  const notes = get(cells, mapping, 'notes').slice(0, 1000) || null;
  const branch = get(cells, mapping, 'branch').slice(0, 80) || null;

  const failed = issues.some((i) => i.level === 'error');
  return {
    status: failed ? 'REJECTED' : issues.length ? 'WARNING' : 'GOOD',
    issues,
    keys: [jobNumber ? `job:${jobNumber.toUpperCase()}` : '', vk ? `vin:${vk}` : '', plateKey ? `plate:${plateKey}` : ''].filter(Boolean),
    values: failed ? null : {
      jobNumber, customer: { externalId: custExt, phone: custPhone, email: custEmail }, vin: vk ? vinRaw : null, vinKey: vk, plate: plateKey ? plateRaw : null, plateKey, openedAt: openedAt!, stage: stage as OpenJobStage, mileage,
      complaints, diagnosis, technician, supervisor, labourAmount, partsAmount, estimateTotal, estimateApproved, partsIssued: parsed.items, paidAmount, paymentMethod, paymentReference, paidOn, notes, branch,
    },
  };
}
