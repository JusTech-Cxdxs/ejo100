/**
 * Data Exchange — checking one row of SAP history (v-A3): invoices from SAP
 * before EJO 100, and the plant's production, QC and PDI registers. Pure,
 * like check.ts. History is read-only: a row is rejected only when it could
 * not be shown truthfully (no number, no date, no amount, no VIN).
 */
import { cellText, phoneKey, vinKey, type Checked, type Issue } from './check';
import { parseAmount } from './check-inventory';
import { lagosToday, parseDay } from './dates';
import type { Mapping } from './fields';

export { lagosToday, parseDay };

function get(cells: unknown[], mapping: Mapping, key: string): string {
  const i = mapping[key];
  return typeof i === 'number' ? cellText(cells[i]) : '';
}

// ── Invoices from SAP ─────────────────────────────────────────────────

export type InvoiceValues = {
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  customer: { externalId: string | null; phone: string | null };
  vin: string | null;
  vinKey: string | null;
  documentType: string | null;
  description: string | null;
  /** SAP company code (BUKRS) and fiscal year (GJAHR): SAP numbers documents per company code and year, so the same number can come back in another year. Fiscal year from the file, else the invoice date's year. */
  companyCode: string | null;
  fiscalYear: number;
  /** The numbering range the number belongs to ("SAP", or "SAP/1000/2026" when the file gives company code or year): an invoice is the same one only within it. */
  source: string;
};

/** The SAP numbering range of a document: plain "SAP", or with its company code and fiscal year when the file gives either. */
export function sapRange(companyCode: string | null, fiscalYear: number | null, given: boolean): string {
  return given ? `SAP/${companyCode ?? '-'}/${fiscalYear ?? '-'}` : 'SAP';
}

export function checkInvoiceRow(cells: unknown[], mapping: Mapping, today = lagosToday()): Checked<InvoiceValues> {
  const issues: Issue[] = [];
  const warn = (field: string, message: string) => issues.push({ field, message, level: 'warning' });
  const fail = (field: string, message: string) => issues.push({ field, message, level: 'error' });

  // SAP pads document numbers with zeros (0090001234): kept as written, compared without them.
  const invoiceNumber = get(cells, mapping, 'invoiceNumber').replace(/^0+(?=\d)/, '');
  if (!invoiceNumber) fail('invoiceNumber', 'Invoice number is required (SAP VBELN or BELNR).');
  else if (invoiceNumber.length > 40) fail('invoiceNumber', 'The invoice number is longer than 40 characters.');

  const dateRaw = get(cells, mapping, 'invoiceDate');
  const invoiceDate = parseDay(dateRaw);
  if (!dateRaw) fail('invoiceDate', 'Invoice date is required (SAP FKDAT or BUDAT).');
  else if (!invoiceDate) fail('invoiceDate', `“${dateRaw}” is not a date. Write it as 14.03.2019, 14/03/2019, 2019-03-14 or 20190314.`);
  else if (invoiceDate > today) fail('invoiceDate', `The invoice date ${invoiceDate} is in the future.`);

  const amountRaw = get(cells, mapping, 'amount');
  const net = parseAmount(amountRaw);
  const taxRaw = get(cells, mapping, 'tax');
  const tax = taxRaw ? parseAmount(taxRaw) : 0;
  if (!amountRaw) fail('amount', 'Amount is required (SAP NETWR, WRBTR or DMBTR).');
  else if (net === null) fail('amount', `“${amountRaw}” is not an amount.`);
  if (taxRaw && tax === null) warn('tax', `Tax “${taxRaw}” is not an amount, so it was left out.`);
  const amount = Math.round(((net ?? 0) + (tax ?? 0)) * 100) / 100;
  if (net !== null && Math.abs(amount) > 10_000_000_000) fail('amount', 'The amount is larger than ₦10 billion: check the column (a quantity or a document number?).');
  if (net !== null && amount < 0) warn('amount', 'A negative amount: kept as a credit note (it reduces the customer’s total).');
  if (net !== null && amount === 0) warn('amount', 'An invoice for ₦0: kept, but it adds nothing to the totals.');

  const currency = get(cells, mapping, 'currency').toUpperCase();
  if (currency && !['NGN', 'N', '₦', 'NAIRA'].includes(currency)) fail('currency', `The amount is in ${currency}. Only naira invoices are loaded: give the amount in the company’s currency (SAP DMBTR) instead.`);

  const custExt = get(cells, mapping, 'customerExternalId').replace(/^0+(?=\d)/, '') || null;
  const custPhone = phoneKey(get(cells, mapping, 'customerPhone'));
  if (!custExt && !custPhone) fail('customer', 'Whose invoice is it? Give the SAP customer number (KUNAG / KUNRG) or the customer’s phone.');

  const vinRaw = get(cells, mapping, 'vin');
  const vk = vinKey(vinRaw);
  if (vk && (vk.length < 6 || vk.length > 25)) warn('vin', `“${vinRaw}” does not look like a chassis number, so the invoice was not linked to a vehicle.`);
  const goodVin = vk && vk.length >= 6 && vk.length <= 25 ? vk : null;

  const documentType = get(cells, mapping, 'documentType').slice(0, 20) || null;
  const companyCode = get(cells, mapping, 'companyCode').toUpperCase().slice(0, 10) || null;
  const yearRaw = get(cells, mapping, 'fiscalYear');
  let fiscalYear: number | null = yearRaw ? Number(yearRaw) : null;
  if (yearRaw && (!Number.isInteger(fiscalYear) || fiscalYear! < 1990 || fiscalYear! > 2100)) { warn('fiscalYear', `Fiscal year “${yearRaw}” is not a year; the invoice date’s year was used.`); fiscalYear = null; }
  const ranged = Boolean(companyCode || fiscalYear);
  const year = fiscalYear ?? (invoiceDate ? Number(invoiceDate.slice(0, 4)) : 0);
  const description = get(cells, mapping, 'description').slice(0, 300) || null;

  const failed = issues.some((i) => i.level === 'error');
  return {
    status: failed ? 'REJECTED' : issues.length ? 'WARNING' : 'GOOD',
    issues,
    keys: invoiceNumber ? [`inv:${sapRange(companyCode, fiscalYear, ranged)}|${invoiceNumber.toUpperCase()}`] : [],
    values: failed ? null : { invoiceNumber, invoiceDate: invoiceDate!, amount, customer: { externalId: custExt, phone: custPhone }, vin: goodVin ? vinRaw : null, vinKey: goodVin, documentType, description, companyCode, fiscalYear: year, source: sapRange(companyCode, fiscalYear, ranged) },
  };
}

// ── Job card and service history (SAP PM/CS service orders) ───────────

export type JobKind = 'JOB_CARD' | 'SERVICE';
export const JOB_KIND_WORDS: Record<JobKind, string> = { JOB_CARD: 'Job card', SERVICE: 'Job card · service' };
export type JobValues = {
  jobNumber: string;
  kind: JobKind;
  orderType: string | null;
  notificationNumber: string | null;
  customer: { externalId: string | null; phone: string | null; email: string | null };
  vin: string | null;
  vinKey: string | null;
  plate: string | null;
  plateKey: string | null;
  equipmentNumber: string | null;
  openedAt: string;
  completedAt: string | null;
  mileage: number | null;
  description: string | null;
  workDone: string | null;
  technician: string | null;
  workCentre: string | null;
  labourAmount: number | null;
  partsAmount: number | null;
  totalAmount: number | null;
  invoiceNumber: string | null;
  status: 'CLOSED' | 'CANCELLED';
  /** The Branch / WERKS cell as written (the loader checks it against the import's branch). */
  branch: string | null;
};

/**
 * Every row is a job card (that is all the workshop ever had: one SAP job
 * card, "carry out service" written on it). Inside EJO a job card whose
 * text says it was a service also counts as a service — it starts the
 * vehicle's next-service clock — so the kind is read from the words:
 * "carry out service", "40,000 km service", "periodic maintenance", or an
 * SAP service order type (SM01). Anything else is a repair.
 */
export function jobKind(text: string, orderType: string | null = null): JobKind {
  const t = ` ${text.toLowerCase()} `;
  if (/\bservic(e|ing)\b|\bmaintenance\b|\b\d{1,3}[,.]?\d{3}\s*km\b|\boil change\b/.test(t)) return 'SERVICE';
  if (orderType && /^(sm01|zsm1|pm0[1-3]|serv)/i.test(orderType)) return 'SERVICE';
  return 'JOB_CARD';
}

/** "Closed", "TECO", "CLSD", "complete" → CLOSED; "Cancelled", "CNCL", "DLFL", "deleted" → CANCELLED; else null. */
export function jobStatus(raw: string): 'CLOSED' | 'CANCELLED' | null {
  const k = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (!k) return 'CLOSED';
  if (/^(closed|close|teco|clsd|complete|completed|done|finished|checkedout|collected|invoiced|billed)/.test(k) || /teco|clsd/.test(k)) return 'CLOSED';
  if (/^(cancelled|canceled|cancel|cncl|dlfl|deleted|void|voided|reversed)/.test(k) || /cncl|dlfl/.test(k)) return 'CANCELLED';
  return null;
}

/** "41,200", "41200 km", "41.200" (SAP) → 41200; nonsense → null. */
export function parseKm(raw: string): number | null {
  const s = String(raw ?? '').trim().toLowerCase().replace(/km|kms|kilomet(re|er)s?/g, '').trim();
  if (!s) return null;
  const n = Number(s.replace(/[\s,]/g, '').replace(/\.(?=\d{3}(\D|$))/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function checkJobRow(cells: unknown[], mapping: Mapping, today = lagosToday()): Checked<JobValues> {
  const issues: Issue[] = [];
  const warn = (field: string, message: string) => issues.push({ field, message, level: 'warning' });
  const fail = (field: string, message: string) => issues.push({ field, message, level: 'error' });

  // SAP pads order numbers with zeros (000004000123456): kept as written, compared without them.
  const jobNumber = get(cells, mapping, 'jobNumber').replace(/^0+(?=\d)/, '');
  if (!jobNumber) fail('jobNumber', 'Job number is required (the SAP order number, AUFNR, or the old job card number).');
  else if (jobNumber.length > 40) fail('jobNumber', 'The job number is longer than 40 characters.');

  const openedRaw = get(cells, mapping, 'openedAt');
  const openedAt = parseDay(openedRaw);
  if (!openedRaw) fail('openedAt', 'Opened on is required (SAP ERDAT or GSTRP).');
  else if (!openedAt) fail('openedAt', `“${openedRaw}” is not a date. Write it as 14.03.2019, 14/03/2019, 2019-03-14 or 20190314.`);
  else if (openedAt > today) fail('openedAt', `The opening date ${openedAt} is in the future.`);

  const completedRaw = get(cells, mapping, 'completedAt');
  let completedAt = parseDay(completedRaw);
  if (completedRaw && !completedAt) { warn('completedAt', `Completed on “${completedRaw}” is not a date, so the job is shown as opened only.`); completedAt = null; }
  else if (completedAt && completedAt > today) fail('completedAt', `The completion date ${completedAt} is in the future.`);
  else if (completedAt && openedAt && completedAt < openedAt) fail('completedAt', `Completed on ${completedAt} is before it was opened on ${openedAt}.`);
  if (!completedRaw) warn('completedAt', 'No completion date: shown as opened only; the next-service clock counts from the day it was opened.');

  const custExt = get(cells, mapping, 'customerExternalId').replace(/^0+(?=\d)/, '') || null;
  const custPhone = phoneKey(get(cells, mapping, 'customerPhone'));
  const custEmail = get(cells, mapping, 'customerEmail').trim().toLowerCase() || null;
  const vinRaw = get(cells, mapping, 'vin');
  const vk = vinKey(vinRaw);
  if (vk && (vk.length < 6 || vk.length > 25)) warn('vin', `“${vinRaw}” does not look like a chassis number, so the job was not linked to a vehicle.`);
  const goodVin = vk && vk.length >= 6 && vk.length <= 25 ? vk : null;
  const plateRaw = get(cells, mapping, 'plateNumber');
  const plateKey = plateRaw ? plateRaw.toUpperCase().replace(/[\s-]/g, '') : null;
  if (!custExt && !custPhone && !custEmail && !goodVin && !plateKey) fail('customer', 'Whose job is it? Give the SAP customer number (KUNUM), the customer’s phone or email, or the vehicle’s chassis number or plate.');
  if (!goodVin && !plateKey) warn('vin', 'No chassis number or plate: the job is kept on the customer only, and cannot start a vehicle’s service clock.');

  const orderType = get(cells, mapping, 'orderType').slice(0, 20) || null;
  const description = get(cells, mapping, 'description').slice(0, 300) || null;
  const workDone = get(cells, mapping, 'workDone').slice(0, 1000) || null;
  const kind = jobKind(`${description ?? ''} ${workDone ?? ''}`, orderType);

  const mileageRaw = get(cells, mapping, 'mileage');
  const mileage = mileageRaw ? parseKm(mileageRaw) : null;
  if (mileageRaw && mileage === null) warn('mileage', `Mileage “${mileageRaw}” is not a number of kilometres, so it was left out.`);
  else if (mileage !== null && mileage > 2_000_000) warn('mileage', `Mileage ${mileage.toLocaleString('en-NG')} km is more than two million; kept, but check the column.`);

  const money = (key: string, label: string): number | null => {
    const raw = get(cells, mapping, key);
    if (!raw) return null;
    const n = parseAmount(raw);
    if (n === null) { warn(key, `${label} “${raw}” is not an amount, so it was left out.`); return null; }
    if (Math.abs(n) > 10_000_000_000) { warn(key, `${label} is larger than ₦10 billion; left out (a document number?).`); return null; }
    return Math.round(n * 100) / 100;
  };
  const labourAmount = money('labourAmount', 'Labour');
  const partsAmount = money('partsAmount', 'Parts');
  let totalAmount = money('totalAmount', 'Total');
  if (totalAmount === null && (labourAmount !== null || partsAmount !== null)) totalAmount = Math.round(((labourAmount ?? 0) + (partsAmount ?? 0)) * 100) / 100;

  const statusRaw = get(cells, mapping, 'status');
  let status = jobStatus(statusRaw);
  if (!status) {
    if (/^(open|released|inprogress|inprocess|wip|created|crtd|rel)$/i.test(statusRaw.replace(/[^a-z]/gi, ''))) fail('status', `Status “${statusRaw}”: a job still open belongs in the open job cards file, not in history.`);
    else { warn('status', `Status “${statusRaw}” was read as Closed.`); }
    status = 'CLOSED';
  }

  const notificationNumber = get(cells, mapping, 'notificationNumber').replace(/^0+(?=\d)/, '').slice(0, 40) || null;
  const invoiceNumber = get(cells, mapping, 'invoiceNumber').replace(/^0+(?=\d)/, '').slice(0, 40) || null;
  const equipmentNumber = get(cells, mapping, 'equipmentNumber').replace(/^0+(?=\d)/, '').slice(0, 40) || null;
  const technician = get(cells, mapping, 'technician').slice(0, 80) || null;
  const workCentre = get(cells, mapping, 'workCentre').slice(0, 40) || null;
  const branch = get(cells, mapping, 'branch').slice(0, 80) || null;

  const failed = issues.some((i) => i.level === 'error');
  return {
    status: failed ? 'REJECTED' : issues.length ? 'WARNING' : 'GOOD',
    issues,
    keys: jobNumber ? [`job:${jobNumber.toUpperCase()}`] : [],
    values: failed ? null : {
      jobNumber, kind, orderType, notificationNumber, customer: { externalId: custExt, phone: custPhone, email: custEmail }, vin: goodVin ? vinRaw : null, vinKey: goodVin, plate: plateKey ? plateRaw : null, plateKey, equipmentNumber,
      openedAt: openedAt!, completedAt, mileage, description, workDone, technician, workCentre, labourAmount, partsAmount, totalAmount, invoiceNumber, status, branch,
    },
  };
}

// ── Production, QC and PDI registers ──────────────────────────────────

export type RegisterKind = 'PRODUCTION' | 'QC' | 'PDI';
export const REGISTER_KIND_LABEL: Record<RegisterKind, string> = { PRODUCTION: 'Production', QC: 'Quality check', PDI: 'Pre-delivery inspection' };

export type RegisterValues = {
  vin: string;
  vinKey: string;
  model: string | null;
  kind: RegisterKind;
  eventDate: string;
  stage: string | null;
  result: string | null;
  inspector: string | null;
  reference: string | null;
  notes: string | null;
  dedupeKey: string;
};

/** "pass", "OK", "Passed", "✓" → PASS; "fail", "NG", "rejected" → FAIL; "rework", "repaired" → REWORK; anything else kept as written. */
export function registerResult(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const k = s.toLowerCase().replace(/[^a-z✓✔✗✘]/g, '');
  if (['pass', 'passed', 'ok', 'okay', 'good', 'accepted', 'approved', 'yes', 'y', 'released', '✓', '✔'].includes(k)) return 'PASS';
  if (['fail', 'failed', 'ng', 'notgood', 'nok', 'rejected', 'reject', 'no', 'n', 'hold', 'onhold', '✗', '✘'].includes(k)) return 'FAIL';
  if (['rework', 'reworked', 'repaired', 'repair', 'rectified', 'fixed'].includes(k)) return 'REWORK';
  if (['open', 'pending', 'inprogress', 'wip'].includes(k)) return 'OPEN';
  return s.slice(0, 40);
}

/** "Production", "line", "assembly" → PRODUCTION; "QC", "quality", "inspection" → QC; "PDI", "pre-delivery" → PDI. */
export function registerKind(raw: string): RegisterKind | null {
  const k = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (!k) return null;
  if (/^(pdi|predelivery|predeliveryinspection|delivery)/.test(k)) return 'PDI';
  if (/^(qc|qa|quality|inspection|qualitycheck|qualitycontrol|kitqc|inbound)/.test(k)) return 'QC';
  if (/^(production|prod|line|assembly|build|manufactur|ckd|skd)/.test(k)) return 'PRODUCTION';
  return null;
}

export function checkRegisterRow(cells: unknown[], mapping: Mapping, defaultKind: RegisterKind | null = null, today = lagosToday()): Checked<RegisterValues> {
  const issues: Issue[] = [];
  const warn = (field: string, message: string) => issues.push({ field, message, level: 'warning' });
  const fail = (field: string, message: string) => issues.push({ field, message, level: 'error' });

  const vinRaw = get(cells, mapping, 'vin');
  const vk = vinKey(vinRaw);
  if (!vk) fail('vin', 'Chassis number (VIN) is required.');
  else if (vk.length < 6 || vk.length > 25) fail('vin', `“${vinRaw}” does not look like a chassis number.`);
  else if (vk.length !== 17) warn('vin', `The chassis number has ${vk.length} characters (a VIN has 17); kept as written.`);

  const kindRaw = get(cells, mapping, 'kind');
  const kind = registerKind(kindRaw) ?? (kindRaw ? null : defaultKind);
  if (!kind) fail('kind', kindRaw ? `“${kindRaw}” is not Production, QC or PDI.` : 'Which register is it — Production, QC or PDI? Add a column, or name the file’s register when importing.');

  const dateRaw = get(cells, mapping, 'eventDate');
  const eventDate = parseDay(dateRaw);
  if (!dateRaw) fail('eventDate', 'Date is required.');
  else if (!eventDate) fail('eventDate', `“${dateRaw}” is not a date. Write it as 14.03.2019, 14/03/2019, 2019-03-14 or 20190314.`);
  else if (eventDate > today) fail('eventDate', `The date ${eventDate} is in the future.`);

  const text = (key: string, max: number) => get(cells, mapping, key).slice(0, max) || null;
  const model = text('model', 60);
  const stage = text('stage', 80);
  const resultRaw = get(cells, mapping, 'result');
  const result = registerResult(resultRaw);
  if (resultRaw && result === resultRaw.trim().slice(0, 40) && !['PASS', 'FAIL', 'REWORK', 'OPEN'].includes(result)) warn('result', `Result “${resultRaw}” was kept as written (not Pass, Fail or Rework).`);
  const inspector = text('inspector', 80);
  const reference = text('reference', 60);
  const notes = text('notes', 500);

  const failed = issues.some((i) => i.level === 'error');
  const dedupeKey = vk && kind && eventDate ? `${kind}|${vk}|${eventDate}|${(stage ?? '').toUpperCase().replace(/\s+/g, ' ')}` : '';
  return {
    status: failed ? 'REJECTED' : issues.length ? 'WARNING' : 'GOOD',
    issues,
    keys: dedupeKey ? [`check:${dedupeKey}`] : [],
    values: failed ? null : { vin: vinRaw, vinKey: vk!, model, kind: kind!, eventDate: eventDate!, stage, result, inspector, reference, notes, dedupeKey },
  };
}
