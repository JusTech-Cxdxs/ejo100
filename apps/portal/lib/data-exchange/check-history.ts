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
};

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
  const description = get(cells, mapping, 'description').slice(0, 300) || null;

  const failed = issues.some((i) => i.level === 'error');
  return {
    status: failed ? 'REJECTED' : issues.length ? 'WARNING' : 'GOOD',
    issues,
    keys: invoiceNumber ? [`inv:${invoiceNumber.toUpperCase()}`] : [],
    values: failed ? null : { invoiceNumber, invoiceDate: invoiceDate!, amount, customer: { externalId: custExt, phone: custPhone }, vin: goodVin ? vinRaw : null, vinKey: goodVin, documentType, description },
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
