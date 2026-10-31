/**
 * Data Exchange — checking one row of a suppliers, parts or opening-stock
 * file (v-A2). Pure, like check.ts: the same limits as the Store's own forms,
 * gaps in old data as notes, and a row rejected only when the record would be
 * wrong (no part number, no description, no quantity or no cost).
 */
import { cleanEmail, cleanOptional, cleanPhone } from '../crm';
import { cellText, type Checked, type Issue } from './check';
import { unitWord, type Mapping } from './fields';

function get(cells: unknown[], mapping: Mapping, key: string): string {
  const i = mapping[key];
  return typeof i === 'number' ? cellText(cells[i]) : '';
}
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * A number as SAP, Excel and people write it: "1,250.00", "₦1,250", "1 250",
 * "100-" (SAP's trailing minus), "(100)". Null when it is not a number.
 */
export function parseAmount(raw: string): number | null {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (/-$/.test(s)) { negative = true; s = s.slice(0, -1); }
  s = s.replace(/^(NGN|N|₦)\s*/i, '').replace(/\s*(NGN)$/i, '').replace(/[\s,]/g, '');
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1); }
  if (!/^\d*\.?\d+(e[+-]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Capitals, single spaces: how part numbers and batches are compared. */
export const partKey = (v: string | null | undefined) => (v ? v.trim().replace(/\s+/g, ' ').toUpperCase() : null);

// ── Suppliers ─────────────────────────────────────────────────────────

export type SupplierValues = { externalId: string | null; name: string; contactName: string | null; phone: string | null; email: string | null; address: string | null; taxId: string | null };

export function checkSupplierRow(cells: unknown[], mapping: Mapping): Checked<SupplierValues> {
  const issues: Issue[] = [];
  const warn = (field: string, message: string) => issues.push({ field, message, level: 'warning' });
  const name = [get(cells, mapping, 'name'), get(cells, mapping, 'name2')].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (!name) issues.push({ field: 'name', level: 'error', message: 'Name is required.' });
  if (name.length > 160) issues.push({ field: 'name', level: 'error', message: 'Name must be 160 characters or fewer.' });
  const opt = (key: string, max: number, label: string) => { try { return cleanOptional(get(cells, mapping, key), max, label); } catch (e) { warn(key, `${msg(e)} It was left out.`); return null; } };
  let phone: string | null = null;
  try { phone = cleanPhone(get(cells, mapping, 'phone'), { required: false, label: 'Phone number' }); } catch (e) { warn('phone', `${msg(e)} It was left out.`); }
  let email: string | null = null;
  const e = get(cells, mapping, 'email');
  if (e) { try { email = cleanEmail(e.split(/[;,\s]+/)[0]); } catch { warn('email', `“${e}” is not a valid email; it was left out.`); } }
  const address = [get(cells, mapping, 'address'), get(cells, mapping, 'city')].filter(Boolean).join(', ').slice(0, 200) || null;
  const externalId = get(cells, mapping, 'externalId').replace(/^0+(?=\d)/, '') || null;
  const failed = issues.some((i) => i.level === 'error');
  return {
    status: failed ? 'REJECTED' : issues.length ? 'WARNING' : 'GOOD',
    issues,
    keys: [externalId ? `ext:${externalId.toUpperCase()}` : null, name ? `name:${name.toUpperCase()}` : null].filter((k): k is string => Boolean(k)),
    values: failed ? null : { externalId, name, contactName: opt('contactName', 120, 'Contact person'), phone, email, address, taxId: opt('taxId', 40, 'Tax ID') },
  };
}

// ── Parts ─────────────────────────────────────────────────────────────

export type PartValues = {
  partNumber: string; name: string; category: string | null; baseUnit: string; trackingType: 'QUANTITY' | 'BATCH' | 'SERIALIZED';
  barcode: string | null; sellingPrice: number | null; reorderPoint: number | null; safetyStock: number | null;
  altUnit: { name: string; factor: number } | null; externalId: string | null;
};

export function checkPartRow(cells: unknown[], mapping: Mapping, source: 'SAP' | 'LEGACY' = 'SAP'): Checked<PartValues> {
  const issues: Issue[] = [];
  const warn = (field: string, message: string) => issues.push({ field, message, level: 'warning' });
  const fail = (field: string, message: string) => issues.push({ field, message, level: 'error' });
  const partNumber = get(cells, mapping, 'partNumber').replace(/\s+/g, ' ').trim();
  if (!partNumber) fail('partNumber', 'Part number is required.');
  else if (partNumber.length > 60) fail('partNumber', 'The part number is longer than 60 characters.');
  const name = get(cells, mapping, 'name');
  if (!name) fail('name', 'Description is required.');
  else if (name.length > 200) fail('name', 'The description is longer than 200 characters.');
  const category = get(cells, mapping, 'category').slice(0, 80) || null;
  let baseUnit = unitWord(get(cells, mapping, 'baseUnit'));
  if (!baseUnit) { baseUnit = 'Piece'; warn('baseUnit', 'No base unit: counted in pieces.'); }
  if (baseUnit.length > 30) { fail('baseUnit', 'The base unit is longer than 30 characters.'); }
  const t = get(cells, mapping, 'trackingType').toLowerCase();
  let trackingType: PartValues['trackingType'] = 'QUANTITY';
  if (/^(batch|lot|x|yes|true|1)$/.test(t) || t.startsWith('batch')) trackingType = 'BATCH';
  else if (/^(serial|serialised|serialized|sn)/.test(t)) trackingType = 'SERIALIZED';
  else if (t && !/^(quantity|qty|no|none|0|false|-)$/.test(t)) {
    // An SAP serial number profile (SERNP, e.g. "ZS01") means serial-tracked.
    if (/^[a-z0-9]{3,5}$/i.test(t) && mapping.trackingType !== undefined) trackingType = 'SERIALIZED';
    else warn('trackingType', `Tracking “${get(cells, mapping, 'trackingType')}” was not recognised; counted by quantity.`);
  }
  const money = (key: string, label: string) => {
    const raw = get(cells, mapping, key);
    if (!raw) return null;
    const n = parseAmount(raw);
    if (n === null || n < 0 || n > 1e12) { warn(key, `${label} “${raw}” is not an amount; it was left out.`); return null; }
    return Math.round(n * 100) / 100;
  };
  const qty = (key: string, label: string) => {
    const raw = get(cells, mapping, key);
    if (!raw) return null;
    const n = parseAmount(raw);
    if (n === null || n < 0 || n > 1e9) { warn(key, `${label} “${raw}” is not a quantity; it was left out.`); return null; }
    return Math.round(n * 1000) / 1000;
  };
  const sellingPrice = money('sellingPrice', 'Selling price');
  const reorderPoint = qty('reorderPoint', 'Reorder point');
  const safetyStock = qty('safetyStock', 'Safety stock');
  const altName = unitWord(get(cells, mapping, 'altUnit'));
  const altFactorRaw = get(cells, mapping, 'altFactor');
  let altUnit: PartValues['altUnit'] = null;
  if (altName && altName.toLowerCase() !== baseUnit.toLowerCase()) {
    const f = parseAmount(altFactorRaw);
    if (f && f > 0 && f <= 1e6) altUnit = { name: altName.slice(0, 30), factor: Math.round(f * 10000) / 10000 };
    else warn('altFactor', `The alternative unit ${altName} has no valid number of base units; it was left out.`);
  }
  const barcode = get(cells, mapping, 'barcode').slice(0, 64) || null;
  const external = get(cells, mapping, 'externalId').trim();
  const externalId = (external || (source === 'SAP' ? partNumber : '')).slice(0, 60) || null;
  const failed = issues.some((i) => i.level === 'error');
  return {
    status: failed ? 'REJECTED' : issues.length ? 'WARNING' : 'GOOD',
    issues,
    keys: [externalId ? `ext:${partKey(externalId)}` : null, partNumber ? `part:${partKey(partNumber)}` : null].filter((k): k is string => Boolean(k)),
    values: failed ? null : { partNumber, name, category, baseUnit, trackingType, barcode, sellingPrice, reorderPoint, safetyStock, altUnit, externalId },
  };
}

// ── Opening stock ─────────────────────────────────────────────────────

export type StockValues = {
  partNumber: string; quantity: number; unit: string | null; unitCost: number; totalValue: number;
  batch: string | null; serials: string[]; storageLocation: string | null;
};

/**
 * One stock line. The cost is the stock value when given (SAP SALK3), else
 * the unit cost ÷ price unit × quantity (SAP VERPR / PEINH). Whether the part
 * is batch or serial tracked is checked against the catalogue on the server.
 */
export function checkStockRow(cells: unknown[], mapping: Mapping): Checked<StockValues> {
  const issues: Issue[] = [];
  const warn = (field: string, message: string) => issues.push({ field, message, level: 'warning' });
  const fail = (field: string, message: string) => issues.push({ field, message, level: 'error' });
  const partNumber = get(cells, mapping, 'partNumber').replace(/\s+/g, ' ').trim();
  if (!partNumber) fail('partNumber', 'Part number is required.');
  const qRaw = get(cells, mapping, 'quantity');
  const quantity = parseAmount(qRaw);
  if (quantity === null) fail('quantity', qRaw ? `Quantity “${qRaw}” is not a number.` : 'Quantity is required.');
  else if (quantity < 0) fail('quantity', `Negative stock (${qRaw}) cannot be an opening balance; correct it in SAP or leave the line out.`);
  else if (quantity === 0) fail('quantity', 'Quantity is zero: there is nothing to bring in.');
  else if (quantity > 1e9) fail('quantity', 'The quantity is too large.');
  const vRaw = get(cells, mapping, 'totalValue');
  const cRaw = get(cells, mapping, 'unitCost');
  const pRaw = get(cells, mapping, 'priceUnit');
  const value = vRaw ? parseAmount(vRaw) : null;
  const cost = cRaw ? parseAmount(cRaw) : null;
  const per = pRaw ? parseAmount(pRaw) : 1;
  if (vRaw && (value === null || value < 0)) fail('totalValue', `Stock value “${vRaw}” is not an amount.`);
  if (cRaw && (cost === null || cost < 0)) fail('unitCost', `Unit cost “${cRaw}” is not an amount.`);
  if (pRaw && (!per || per <= 0)) fail('priceUnit', `Price unit “${pRaw}” is not a positive number.`);
  let totalValue = 0;
  let unitCost = 0;
  if (quantity && quantity > 0 && !issues.some((i) => i.level === 'error')) {
    if (value !== null && value > 0) {
      totalValue = value;
      unitCost = value / quantity;
      if (cost !== null && cost > 0) {
        const implied = (cost / (per || 1)) * quantity;
        if (Math.abs(implied - value) > Math.max(1, value * 0.01)) warn('unitCost', `The stock value (${value.toLocaleString('en-NG')}) and unit cost × quantity (${Math.round(implied).toLocaleString('en-NG')}) differ; the stock value was used.`);
      }
    } else if (cost !== null && cost > 0) {
      unitCost = cost / (per || 1);
      totalValue = unitCost * quantity;
    } else fail('totalValue', 'No cost: give the stock value or the unit cost (stock is valued at what it cost).');
  }
  const serials = get(cells, mapping, 'serials').split(/[;,|\n]+/).map((x) => x.trim()).filter(Boolean);
  if (new Set(serials).size !== serials.length) fail('serials', 'The same serial number appears twice in this line.');
  if (serials.length && quantity && serials.length !== quantity) fail('serials', `${serials.length} serial numbers for a quantity of ${quantity}: they must match.`);
  const batch = get(cells, mapping, 'batch').slice(0, 60) || null;
  const storageLocation = get(cells, mapping, 'storageLocation').slice(0, 40) || null;
  const unit = get(cells, mapping, 'unit') ? unitWord(get(cells, mapping, 'unit')) : null;
  const failed = issues.some((i) => i.level === 'error');
  return {
    status: failed ? 'REJECTED' : issues.length ? 'WARNING' : 'GOOD',
    issues,
    // One line per part, batch and storage location (SAP lists the same part once per storage location).
    keys: partNumber ? [`line:${partKey(partNumber)}|${partKey(batch) ?? ''}|${partKey(storageLocation) ?? ''}`, ...serials.map((x) => `serial:${x.toUpperCase()}`)] : [],
    values: failed ? null : { partNumber, quantity: quantity!, unit, unitCost: Math.round(unitCost * 1_000_000) / 1_000_000, totalValue: Math.round(totalValue * 100) / 100, batch, serials, storageLocation },
  };
}
