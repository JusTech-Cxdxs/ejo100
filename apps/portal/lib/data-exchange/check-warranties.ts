/**
 * Data Exchange — checking one row of the warranties file and of the open
 * warranty claims file (P6). Pure, like check.ts; the server part
 * (warranties-server.ts) finds the customer, the vehicle, the policy, the
 * part and the warranty a claim is on.
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

const plateKeyOf = (raw: string) => (raw ? raw.toUpperCase().replace(/[\s-]/g, '') : null);
const word = (raw: string) => raw.toLowerCase().replace(/[^a-z]/g, '');
export const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
export const kindWord = (k: string) => (k === 'PART' ? 'part' : 'vehicle');

// ── Warranties ────────────────────────────────────────────────────────

export type ImportedWarrantyStatus = 'ACTIVE' | 'SUSPENDED' | 'VOID' | 'TRANSFERRED';
export const STATUS_WORD: Record<ImportedWarrantyStatus, string> = { ACTIVE: 'Active', SUSPENDED: 'Suspended', VOID: 'Void', TRANSFERRED: 'Transferred' };

/** Active (empty, "valid", "in force", "expired": expiry is worked out from the dates), Suspended, Void, Transferred; null when the word is not known. */
export function warrantyStatus(raw: string): ImportedWarrantyStatus | null {
  const k = word(raw);
  if (!k || /active|valid|inforce|current|open|expired|lapsed|ok|yes/.test(k)) return 'ACTIVE';
  if (/suspend|onhold|hold|blocked/.test(k)) return 'SUSPENDED';
  if (/void|cancel|revoked|invalid|terminated/.test(k)) return 'VOID';
  if (/transfer|newowner|sold/.test(k)) return 'TRANSFERRED';
  return null;
}

export type WarrantyValues = {
  warrantyNumber: string;
  kind: 'ASSET' | 'PART';
  vin: string | null;
  vinKey: string | null;
  plate: string | null;
  plateKey: string | null;
  customer: { externalId: string | null; phone: string | null; email: string | null };
  policy: string | null;
  provider: string | null;
  months: number | null;
  distanceLimit: number | null;
  startsAt: string;
  endsAt: string | null;
  startReading: number | null;
  partNumber: string | null;
  serialNumber: string | null;
  evidence: string | null;
  status: ImportedWarrantyStatus;
  notes: string | null;
};

export function checkWarrantyRow(cells: unknown[], mapping: Mapping, today = lagosToday()): Checked<WarrantyValues> {
  const issues: Issue[] = [];
  const warn = (field: string, message: string) => issues.push({ field, message, level: 'warning' });
  const fail = (field: string, message: string) => issues.push({ field, message, level: 'error' });

  const warrantyNumber = get(cells, mapping, 'warrantyNumber').replace(/^0+(?=\d)/, '');
  if (!warrantyNumber) fail('warrantyNumber', 'Warranty number is required (SAP MGANR or the old system’s warranty or certificate number).');
  else if (warrantyNumber.length > 40) fail('warrantyNumber', 'The warranty number is longer than 40 characters.');

  const kindRaw = word(get(cells, mapping, 'kind'));
  const partNumber = get(cells, mapping, 'partNumber').toUpperCase().slice(0, 60) || null;
  const noVehicle = !get(cells, mapping, 'vin') && !get(cells, mapping, 'plateNumber');
  let kind: 'ASSET' | 'PART';
  if (/part|component|material|battery|tyre|tire/.test(kindRaw)) kind = 'PART';
  else if (/vehicle|asset|car|truck|bus|unit|equipment|machine/.test(kindRaw)) kind = 'ASSET';
  else {
    // Not said (or not understood): a part number with no vehicle is a part warranty.
    kind = partNumber && noVehicle ? 'PART' : 'ASSET';
    if (kindRaw) warn('kind', `“${get(cells, mapping, 'kind')}” is not Vehicle or Part; read as ${kind === 'PART' ? 'Part' : 'Vehicle'}.`);
  }

  const vinRaw = get(cells, mapping, 'vin');
  const vk = vinKey(vinRaw);
  if (vk && (vk.length < 6 || vk.length > 25)) fail('vin', `“${vinRaw}” does not look like a chassis number.`);
  const plateRaw = get(cells, mapping, 'plateNumber');
  const plateKey = plateKeyOf(plateRaw);
  if (kind === 'ASSET' && !vk && !plateKey) fail('vin', 'Which vehicle does it cover? Give the chassis number (VIN) or the plate: the vehicle must be in EJO.');
  if (kind === 'PART' && !partNumber) fail('partNumber', 'A part warranty needs the part number, as in EJO’s parts catalogue.');

  const custExt = get(cells, mapping, 'customerExternalId').replace(/^0+(?=\d)/, '') || null;
  const custPhone = phoneKey(get(cells, mapping, 'customerPhone'));
  const custEmail = get(cells, mapping, 'customerEmail').trim().toLowerCase() || null;
  if (kind === 'PART' && !vk && !plateKey && !custExt && !custPhone && !custEmail) fail('customerExternalId', 'Whose part is it? Give the vehicle it is fitted to, or the customer’s number, phone or email.');

  const startsRaw = get(cells, mapping, 'startsAt');
  const startsAt = parseDay(startsRaw);
  if (!startsRaw) fail('startsAt', 'Starts on is required (the delivery or fitting date, SAP GWLDT).');
  else if (!startsAt) fail('startsAt', `“${startsRaw}” is not a date. Write it as 14.03.2024, 14/03/2024, 2024-03-14 or 20240314.`);
  else if (startsAt > today) fail('startsAt', `The start date ${startsAt} is in the future: a warranty starts on the day the vehicle or part was delivered.`);

  const endsRaw = get(cells, mapping, 'endsAt');
  let endsAt = endsRaw ? parseDay(endsRaw) : null;
  if (endsRaw && !endsAt) warn('endsAt', `Ends on “${endsRaw}” is not a date; it is worked out from the policy.`);
  if (endsAt && startsAt && endsAt <= startsAt) { fail('endsAt', `Ends on ${endsAt} is not after the start ${startsAt}.`); endsAt = null; }
  if (endsAt && endsAt < today) warn('endsAt', `Already ended on ${endsAt}: kept for its history (a claim before then still counts).`);

  const intOf = (key: string, label: string): number | null => {
    const raw = get(cells, mapping, key);
    if (!raw) return null;
    const n = parseKm(raw);
    if (n === null) { warn(key, `${label} “${raw}” is not a whole number; left out.`); return null; }
    return n;
  };
  const months = intOf('months', 'Months');
  if (months !== null && (months < 1 || months > 240)) warn('months', `${months} months is not a warranty length; left out.`);
  const distanceLimit = intOf('distanceLimit', 'The km limit');
  const startReading = intOf('startReading', 'The odometer at start');

  const statusRaw = get(cells, mapping, 'status');
  const status = warrantyStatus(statusRaw);
  if (!status) fail('status', `“${statusRaw}” is not a warranty status EJO knows: use Active, Suspended, Void or Transferred.`);

  const policy = get(cells, mapping, 'policy').slice(0, 120) || null;
  const provider = get(cells, mapping, 'provider').slice(0, 120) || null;
  if (!policy && months === null) fail('policy', 'Which policy is it under? Give the EJO policy code or name, or its months (and km) so the policy can be found.');
  const serialNumber = get(cells, mapping, 'serialNumber').toUpperCase().slice(0, 80) || null;
  if (kind === 'ASSET' && serialNumber) warn('serialNumber', 'A vehicle warranty has no part serial; the serial was left out.');
  const evidence = get(cells, mapping, 'evidence').slice(0, 300) || null;
  const notes = get(cells, mapping, 'notes').slice(0, 1000) || null;
  if ((status === 'SUSPENDED' || status === 'VOID' || status === 'TRANSFERRED') && !notes) warn('notes', `${STATUS_WORD[status]} with no reason given: the reason reads “${STATUS_WORD[status]} before EJO.”`);

  const failed = issues.some((i) => i.level === 'error');
  return {
    status: failed ? 'REJECTED' : issues.length ? 'WARNING' : 'GOOD',
    issues,
    keys: [warrantyNumber ? `wty:${warrantyNumber.toUpperCase()}` : ''].filter(Boolean),
    values: failed ? null : {
      warrantyNumber, kind, vin: vk ? vinRaw : null, vinKey: vk, plate: plateKey ? plateRaw : null, plateKey,
      customer: { externalId: custExt, phone: custPhone, email: custEmail },
      policy, provider, months: months !== null && months >= 1 && months <= 240 ? months : null, distanceLimit, startsAt: startsAt!, endsAt, startReading,
      partNumber: kind === 'PART' ? partNumber : null, serialNumber: kind === 'PART' ? serialNumber : null, evidence, status: status!, notes,
    },
  };
}

// ── The policy a warranty is under ────────────────────────────────────

export type Policy = { id: string; code: string; name: string; kind: string; providerId: string; providerName: string; durationMonths: number; durationUnit: string; distanceLimit: number | null; coverageSummary: string; exclusions: string | null; conditions: string | null; isActive: boolean; archivedAt: Date | null };

/** The policy a row names (its code, then its name), or the one policy of the same kind with the same months (and km, and provider) when none is named. */
export function pickPolicy(v: Pick<WarrantyValues, 'policy' | 'provider' | 'months' | 'distanceLimit' | 'kind'>, policies: Policy[]): { policy: Policy | null; error: string | null; note: string | null } {
  const live = policies.filter((p) => !p.archivedAt);
  if (v.policy) {
    const k = v.policy.trim().toUpperCase();
    const hit = policies.find((p) => p.code.toUpperCase() === k) ?? policies.find((p) => norm(p.name) === norm(v.policy!)) ?? null;
    if (!hit) return { policy: null, error: `There is no warranty policy “${v.policy}” in EJO. Create it under Warranty → Policies (its code or name), or give the months and km so it can be found.`, note: null };
    return { policy: hit, error: null, note: null };
  }
  const matches = live.filter((p) => p.kind === v.kind && p.durationUnit === 'MONTHS' && p.durationMonths === v.months && (v.distanceLimit === null || p.distanceLimit === v.distanceLimit) && (!v.provider || norm(p.providerName) === norm(v.provider)));
  const terms = `${v.months} months${v.distanceLimit !== null ? ` / ${v.distanceLimit.toLocaleString('en-NG')} km` : ''}${v.provider ? ` from ${v.provider}` : ''}`;
  if (matches.length === 1) return { policy: matches[0]!, error: null, note: `No policy named: ${matches[0]!.code} (${matches[0]!.name}) is the ${kindWord(v.kind)} policy with ${terms}.` };
  if (!matches.length) return { policy: null, error: `No ${kindWord(v.kind)} warranty policy in EJO has ${terms}. Create it under Warranty → Policies first, or name the policy.`, note: null };
  return { policy: null, error: `${matches.length} ${kindWord(v.kind)} policies have ${terms} (${matches.slice(0, 4).map((p) => p.code).join(', ')}): name the policy.`, note: null };
}

// ── Open claims ───────────────────────────────────────────────────────

/** The claim stages an open claim can be brought in at (never settled or cancelled: those are history). */
export type OpenClaimStage = 'DRAFT' | 'PENDING_HOD' | 'PENDING_MANAGER' | 'APPROVED_TO_SUBMIT' | 'SUBMITTED' | 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'REJECTED';
export const OPEN_CLAIM_STAGE_WORDS: Record<OpenClaimStage, string> = {
  DRAFT: 'Draft', PENDING_HOD: 'With the Warranty HOD', PENDING_MANAGER: 'With the Manager', APPROVED_TO_SUBMIT: 'Approved to submit', SUBMITTED: 'Submitted', ACCEPTED: 'Accepted', PARTIALLY_ACCEPTED: 'Partially accepted', REJECTED: 'Rejected',
};

/**
 * The stage, from EJO's words or the old system's: empty, "draft", "new",
 * "open" → draft; "HOD", "review" → with the Warranty HOD; "manager" →
 * with the Manager; "approved to submit", "ready" → approved to submit;
 * "submitted", "sent", "with provider", "pending provider" → submitted;
 * "partially" → partially accepted; "accepted", "approved by provider",
 * "credited" → accepted; "rejected", "declined" → rejected. 'CLOSED' for
 * settled, paid, closed or cancelled (history), null for words it does not know.
 */
export function openClaimStage(raw: string): OpenClaimStage | 'CLOSED' | null {
  const k = word(raw);
  if (!k) return 'DRAFT';
  if (/settled|paid|closed|cancel|withdrawn|void|completed|reimbursed/.test(k)) return 'CLOSED';
  if (/partial/.test(k)) return 'PARTIALLY_ACCEPTED';
  if (/reject|declin|refused|denied/.test(k)) return 'REJECTED';
  if (/approvedtosubmit|readytosubmit|tosubmit|ready|approvedinternally/.test(k)) return 'APPROVED_TO_SUBMIT';
  if (/submitted|sent|withprovider|pendingprovider|withmanufacturer|awaitingprovider|awaitingdecision|underreview/.test(k)) return 'SUBMITTED';
  if (/accepted|approvedbyprovider|providerapproved|credited|granted|approved/.test(k)) return 'ACCEPTED';
  if (/manager|branchmanager/.test(k)) return 'PENDING_MANAGER';
  if (/hod|headofdepartment|review|pendingapproval|forapproval/.test(k)) return 'PENDING_HOD';
  if (/draft|new|open|created|started|inprogress|preparing/.test(k)) return 'DRAFT';
  return null;
}

/** The order of the stages, to say whether one is past another. */
const ORDER: OpenClaimStage[] = ['DRAFT', 'PENDING_HOD', 'PENDING_MANAGER', 'APPROVED_TO_SUBMIT', 'SUBMITTED', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED'];
export const atOrPast = (s: OpenClaimStage, than: OpenClaimStage) => ORDER.indexOf(s) >= ORDER.indexOf(than);

export type ClaimValues = {
  claimNumber: string;
  warrantyNumber: string | null;
  vin: string | null;
  vinKey: string | null;
  plateKey: string | null;
  stage: OpenClaimStage;
  failureDate: string;
  failureReading: number | null;
  complaint: string;
  cause: string;
  correction: string;
  causalPart: string;
  causalPartNumber: string | null;
  labourAmount: number;
  partsAmount: number;
  otherAmount: number;
  logisticsAmount: number;
  claimedAmount: number;
  approvedAmount: number | null;
  providerReference: string | null;
  submittedOn: string | null;
  decidedOn: string | null;
  remedy: 'REIMBURSEMENT' | 'REPLACEMENT' | 'REPAIR' | null;
  partReturn: { required: boolean; status: 'AWAITING' | 'SENT' | 'RECEIVED_BY_PROVIDER' | null } | null;
  decisionNotes: string | null;
};

export const NOT_RECORDED = 'Not recorded before EJO.';

export function checkClaimRow(cells: unknown[], mapping: Mapping, today = lagosToday()): Checked<ClaimValues> {
  const issues: Issue[] = [];
  const warn = (field: string, message: string) => issues.push({ field, message, level: 'warning' });
  const fail = (field: string, message: string) => issues.push({ field, message, level: 'error' });

  const claimNumber = get(cells, mapping, 'claimNumber').replace(/^0+(?=\d)/, '');
  if (!claimNumber) fail('claimNumber', 'Claim number is required (SAP CLMNO or QMNUM, or the old system’s claim number).');
  else if (claimNumber.length > 40) fail('claimNumber', 'The claim number is longer than 40 characters.');

  const warrantyNumber = get(cells, mapping, 'warrantyNumber').replace(/^0+(?=\d)/, '').slice(0, 40) || null;
  const vinRaw = get(cells, mapping, 'vin');
  const vk = vinKey(vinRaw);
  const plateKey = plateKeyOf(get(cells, mapping, 'plateNumber'));
  if (!warrantyNumber && !vk && !plateKey) fail('warrantyNumber', 'Which warranty is it on? Give the warranty number, or the vehicle’s chassis number or plate.');

  const stageRaw = get(cells, mapping, 'status');
  const stage = openClaimStage(stageRaw);
  if (stage === 'CLOSED') fail('status', `Stage “${stageRaw}”: a settled or cancelled claim is history and stays in the old system; bring in the claims still open.`);
  else if (!stage) fail('status', `“${stageRaw}” is not a claim stage EJO knows: use Draft, With the Warranty HOD, With the Manager, Approved to submit, Submitted, Accepted, Partially accepted or Rejected.`);

  const failRaw = get(cells, mapping, 'failureDate');
  const failureDate = parseDay(failRaw);
  if (!failRaw) fail('failureDate', 'Failure date is required (SAP REPDA, the day it failed or was repaired).');
  else if (!failureDate) fail('failureDate', `“${failRaw}” is not a date. Write it as 21.10.2026, 21/10/2026, 2026-10-21 or 20261021.`);
  else if (failureDate > today) fail('failureDate', `The failure date ${failureDate} is in the future.`);
  const readingRaw = get(cells, mapping, 'failureReading');
  const failureReading = readingRaw ? parseKm(readingRaw) : null;
  if (readingRaw && failureReading === null) warn('failureReading', `“${readingRaw}” is not a number of kilometres; left out.`);

  const complaint = get(cells, mapping, 'complaint').slice(0, 2000);
  if (!complaint) fail('complaint', 'The complaint is required: what the customer reported.');
  const text = (key: string, label: string, need: boolean) => {
    const v = get(cells, mapping, key).slice(0, 2000);
    if (!v && need) warn(key, `No ${label} given: the claim reads “${NOT_RECORDED}” there — fill it in before it goes to the provider.`);
    return v || (need ? NOT_RECORDED : '');
  };
  const pastDraft = stage && stage !== 'CLOSED' && stage !== 'DRAFT';
  const cause = text('cause', 'cause', Boolean(pastDraft));
  const correction = text('correction', 'correction', Boolean(pastDraft));
  const causalPartNumber = get(cells, mapping, 'causalPartNumber').toUpperCase().slice(0, 60) || null;
  const causalPart = get(cells, mapping, 'causalPart').slice(0, 200) || causalPartNumber || (pastDraft ? NOT_RECORDED : '');

  const money = (key: string, label: string): number | null => {
    const raw = get(cells, mapping, key);
    if (!raw) return null;
    const n = parseAmount(raw);
    if (n === null) { warn(key, `${label} “${raw}” is not an amount; left out.`); return null; }
    if (n < 0) { warn(key, `${label} is negative; left out.`); return null; }
    if (n > 10_000_000_000) { warn(key, `${label} is larger than ₦10 billion; left out (a document number?).`); return null; }
    return Math.round(n * 100) / 100;
  };
  const labourAmount = money('labourAmount', 'Labour') ?? 0;
  const partsAmount = money('partsAmount', 'Parts') ?? 0;
  const otherAmount = money('otherAmount', 'Other') ?? 0;
  const logisticsAmount = money('logisticsAmount', 'Logistics') ?? 0;
  const sum = Math.round((labourAmount + partsAmount + otherAmount + logisticsAmount) * 100) / 100;
  const total = money('claimedAmount', 'The claimed total');
  let claimedAmount = sum;
  if (total !== null && sum === 0) claimedAmount = total;
  else if (total !== null && Math.abs(total - sum) > 0.5) warn('claimedAmount', `The claimed total (₦${total.toLocaleString('en-NG')}) is not labour + parts + other + logistics (₦${sum.toLocaleString('en-NG')}); EJO keeps the parts it is made of, ₦${sum.toLocaleString('en-NG')}.`);
  if (total !== null && sum === 0) warn('labourAmount', 'Only a total was given: it is kept as “Other” until labour and parts are split.');
  if (pastDraft && stage !== 'PENDING_HOD' && claimedAmount === 0) warn('claimedAmount', 'No amount claimed on a claim past the draft: fill in the amounts in EJO.');

  let approvedAmount = money('approvedAmount', 'The accepted amount');
  if (stage === 'ACCEPTED' && approvedAmount === null) { approvedAmount = claimedAmount; if (claimedAmount) warn('approvedAmount', `Accepted with no amount given: the full claim (₦${claimedAmount.toLocaleString('en-NG')}) is taken as accepted.`); }
  if (stage === 'PARTIALLY_ACCEPTED' && approvedAmount === null) fail('approvedAmount', 'Partially accepted: give the amount the provider accepted.');
  if (approvedAmount !== null && approvedAmount > claimedAmount + 0.5 && claimedAmount > 0) warn('approvedAmount', `Accepted ₦${approvedAmount.toLocaleString('en-NG')} is more than the ₦${claimedAmount.toLocaleString('en-NG')} claimed; kept as given.`);
  if (stage && stage !== 'CLOSED' && !['ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(stage) && approvedAmount !== null) { warn('approvedAmount', 'An accepted amount on a claim the provider has not decided: left out.'); approvedAmount = null; }

  const providerReference = get(cells, mapping, 'providerReference').slice(0, 80) || null;
  if (stage && stage !== 'CLOSED' && atOrPast(stage, 'SUBMITTED') && !providerReference) warn('providerReference', 'With the provider, but no provider reference: add it in EJO when you have it.');
  const dateOf = (key: string, label: string): string | null => {
    const raw = get(cells, mapping, key);
    if (!raw) return null;
    const d = parseDay(raw);
    if (!d) { warn(key, `${label} “${raw}” is not a date; the failure date is used.`); return null; }
    if (d > today) { warn(key, `${label} ${d} is in the future; the failure date is used.`); return null; }
    if (failureDate && d < failureDate) { warn(key, `${label} ${d} is before the failure date; the failure date is used.`); return null; }
    return d;
  };
  const submittedOn = dateOf('submittedOn', 'Submitted on');
  let decidedOn = dateOf('decidedOn', 'Decided on');
  if (decidedOn && submittedOn && decidedOn < submittedOn) { warn('decidedOn', `Decided on ${decidedOn} is before the submission; the submission date is used.`); decidedOn = null; }

  const remedyRaw = word(get(cells, mapping, 'remedy'));
  const remedy = !remedyRaw ? null : /replace/.test(remedyRaw) ? 'REPLACEMENT' : /repair/.test(remedyRaw) ? 'REPAIR' : /reimburs|credit|refund|pay|money|cash/.test(remedyRaw) ? 'REIMBURSEMENT' : null;
  if (remedyRaw && !remedy) warn('remedy', `“${get(cells, mapping, 'remedy')}” is not Reimbursement, Replacement or Repair; the policy’s usual remedy is used.`);

  const returnRaw = word(get(cells, mapping, 'partReturnRequired'));
  let partReturn: ClaimValues['partReturn'] = null;
  if (returnRaw) {
    if (/received|delivered|withprovider|returned/.test(returnRaw)) partReturn = { required: true, status: 'RECEIVED_BY_PROVIDER' };
    else if (/sent|shipped|dispatched|intransit/.test(returnRaw)) partReturn = { required: true, status: 'SENT' };
    else if (['yes', 'y', 'true', 'x', 'required', 'awaiting'].includes(returnRaw)) partReturn = { required: true, status: 'AWAITING' };
    else if (['no', 'n', 'false', 'notrequired', 'none'].includes(returnRaw)) partReturn = { required: false, status: null };
    else warn('partReturnRequired', `“${get(cells, mapping, 'partReturnRequired')}” is not Yes, No, Sent or Received; the provider’s rule decides.`);
  }
  const decisionNotes = get(cells, mapping, 'decisionNotes').slice(0, 2000) || null;
  if (stage === 'REJECTED' && !decisionNotes) warn('decisionNotes', 'Rejected with no reason given: add the provider’s reason in EJO before reopening it.');

  const failed = issues.some((i) => i.level === 'error');
  return {
    status: failed ? 'REJECTED' : issues.length ? 'WARNING' : 'GOOD',
    issues,
    keys: [claimNumber ? `claim:${claimNumber.toUpperCase()}` : ''].filter(Boolean),
    values: failed ? null : {
      claimNumber, warrantyNumber, vin: vk ? vinRaw : null, vinKey: vk, plateKey, stage: stage as OpenClaimStage, failureDate: failureDate!, failureReading,
      complaint, cause, correction, causalPart,
      causalPartNumber, labourAmount, partsAmount, otherAmount: total !== null && sum === 0 ? total : otherAmount, logisticsAmount, claimedAmount, approvedAmount,
      providerReference, submittedOn, decidedOn, remedy, partReturn, decisionNotes,
    },
  };
}
