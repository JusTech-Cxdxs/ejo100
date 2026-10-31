/**
 * Data Exchange — checking one row of a file. Pure: the same rules as the
 * front desk's own forms (lib/crm), so an imported customer meets exactly the
 * standard of one typed in by hand, with one difference made for old data:
 * a problem that does not make the record wrong (no address, an email that is
 * not valid) is a WARNING — the row loads, without that value, and the
 * report says so — rather than stopping thousands of good rows.
 *
 * A row is REJECTED only when the record would be wrong or unusable: no name,
 * no chassis number or plate, no way to find a vehicle's customer.
 */
import { CrmInputError, PRIMARY_ADDRESS_MAX, cleanEmail, cleanName, cleanOptional, cleanPhone, normaliseTags } from '../crm';
import { ENTITIES, type EntityKey, type Mapping } from './fields';

export type Issue = { field: string; message: string; level: 'error' | 'warning' };
export type RowStatus = 'GOOD' | 'WARNING' | 'REJECTED';

export type CustomerValues = {
  externalId: string | null;
  fullName: string;
  customerType: 'INDIVIDUAL' | 'ORGANIZATION';
  companyName: string | null;
  email: string | null;
  phone: string | null;
  altPhone: string | null;
  /** The primary address (one line, ≤ 80 characters), and the full text when it had to be shortened. */
  address: string | null;
  fullAddress: { line1: string; city: string | null; state: string | null } | null;
  taxId: string | null;
  tags: string[];
};

export type VehicleValues = {
  customer: { externalId: string | null; email: string | null; phone: string | null };
  externalId: string | null;
  chassisNumber: string | null;
  plateNumber: string | null;
  engineNumber: string | null;
  engineType: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  vehicleType: 'PASSENGER' | 'COMMERCIAL' | null;
  mileage: number | null;
};

export type Checked<V> = {
  status: RowStatus;
  issues: Issue[];
  values: V | null;
  /** The keys this row is recognised by, strongest first ("ext:1000123", "email:a@b.ng", "phone:08031234567", "vin:…", "plate:…"). */
  keys: string[];
};

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** A cell as text: numbers Excel stored as 1.0E+10 come back as their digits; "N/A", "-", "null" are empty. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = squash(String(v));
  return /^(n\/?a|null|none|nil|-+|\.+)$/i.test(s) ? '' : s;
}

function get(cells: unknown[], mapping: Mapping, key: string): string {
  const i = mapping[key];
  return typeof i === 'number' ? cellText(cells[i]) : '';
}

/** Digits only, for matching phones written differently (0803 123 4567, +234 803 123 4567 → 8031234567). */
export function phoneKey(p: string | null | undefined): string | null {
  const d = String(p ?? '').replace(/\D/g, '');
  if (d.length < 7) return null;
  if (d.startsWith('234') && d.length >= 12) return d.slice(3);
  if (d.startsWith('0') && d.length === 11) return d.slice(1);
  return d;
}

/** VINs and plates compared without spaces or dashes, in capitals. */
export const vinKey = (v: string | null | undefined) => (v ? v.toUpperCase().replace(/[\s-]/g, '') : null);
export const plateKey = (v: string | null | undefined) => (v ? v.toUpperCase().replace(/[\s-]/g, '') : null);

const msg = (e: unknown) => (e instanceof CrmInputError || e instanceof Error ? e.message : String(e));

/** The primary address line: the street, with the city added while it fits in one line. */
export function primaryAddress(street: string, city: string, state: string): { address: string | null; full: CustomerValues['fullAddress']; shortened: boolean } {
  const parts = [street, city].filter(Boolean);
  if (!parts.length) return { address: state || null, full: null, shortened: false };
  const joined = parts.join(', ');
  if (joined.length <= PRIMARY_ADDRESS_MAX) return { address: joined, full: null, shortened: false };
  const first = street || city;
  if (first.length <= PRIMARY_ADDRESS_MAX) return { address: first, full: null, shortened: false };
  // Too long for the one printed line: cut at the last space that fits, keep the whole text as an extra address.
  const cut = first.slice(0, PRIMARY_ADDRESS_MAX + 1);
  const at = cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : PRIMARY_ADDRESS_MAX;
  return { address: first.slice(0, at).replace(/[,\s]+$/, ''), full: { line1: street || city, city: street ? city || null : null, state: state || null }, shortened: true };
}

export function checkCustomerRow(cells: unknown[], mapping: Mapping): Checked<CustomerValues> {
  const issues: Issue[] = [];
  const warn = (field: string, message: string) => issues.push({ field, message, level: 'warning' });
  const fail = (field: string, message: string) => issues.push({ field, message, level: 'error' });

  let fullName = '';
  try {
    const n2 = get(cells, mapping, 'name2');
    fullName = cleanName([get(cells, mapping, 'fullName'), n2].filter(Boolean).join(' '), 'Name');
  } catch (e) {
    fail('fullName', msg(e));
  }

  const companyName = (() => {
    try { return cleanOptional(get(cells, mapping, 'companyName'), 160, 'Company name'); } catch (e) { warn('companyName', `${msg(e)} It was left out.`); return null; }
  })();
  const typeRaw = get(cells, mapping, 'customerType').toLowerCase();
  let customerType: CustomerValues['customerType'] = companyName ? 'ORGANIZATION' : 'INDIVIDUAL';
  if (typeRaw) {
    if (/^(org|organi[sz]ation|company|corporate|business|fleet|government|ngo|2|b2b|ltd|plc|enterprise)/.test(typeRaw)) customerType = 'ORGANIZATION';
    else if (/^(ind|individual|person|private|personal|1|b2c|retail)/.test(typeRaw)) customerType = 'INDIVIDUAL';
    else warn('customerType', `Type “${get(cells, mapping, 'customerType')}” was not recognised; saved as ${customerType === 'ORGANIZATION' ? 'Organisation' : 'Individual'}.`);
  }

  let email: string | null = null;
  const emailRaw = get(cells, mapping, 'email');
  if (emailRaw) {
    // Several addresses in one cell ("a@x.ng; b@x.ng"): the first is theirs; the rest are reported.
    const first = emailRaw.split(/[;,\s]+/).filter(Boolean)[0] ?? '';
    try {
      email = cleanEmail(first);
      if (first !== emailRaw.trim()) warn('email', 'More than one email in the cell; the first was kept.');
    } catch {
      warn('email', `“${emailRaw}” is not a valid email, so the customer was kept without one (no portal access until it is corrected).`);
    }
  }

  const phoneOf = (key: string, label: string) => {
    try { return cleanPhone(get(cells, mapping, key), { required: false, label }); } catch (e) { warn(key, `${msg(e)} It was left out.`); return null; }
  };
  const phone = phoneOf('phone', 'Phone number');
  let altPhone = phoneOf('altPhone', 'Second phone number');
  if (altPhone && phone && phoneKey(altPhone) === phoneKey(phone)) altPhone = null;
  if (!phone) warn('phone', 'No phone number: the customer page will show it as a gap to fill.');

  const addr = primaryAddress(get(cells, mapping, 'address'), get(cells, mapping, 'city'), get(cells, mapping, 'state'));
  if (!addr.address) warn('address', 'No address: the customer page will show it as a gap to fill.');
  if (addr.shortened) warn('address', `The address is longer than ${PRIMARY_ADDRESS_MAX} characters, so the printed line was shortened; the full address is kept as an extra address.`);

  const taxId = (() => {
    try { return cleanOptional(get(cells, mapping, 'taxId'), 40, 'Tax ID'); } catch (e) { warn('taxId', `${msg(e)} It was left out.`); return null; }
  })();
  let tags: string[] = [];
  try { tags = normaliseTags(get(cells, mapping, 'tags')); } catch (e) { warn('tags', `${msg(e)} Tags were left out.`); }

  const externalId = get(cells, mapping, 'externalId').replace(/^0+(?=\d)/, '') || null;
  if (externalId && externalId.length > 60) fail('externalId', 'The customer number is longer than 60 characters.');
  if (!externalId && !email && !phone) warn('externalId', 'No customer number, email or phone: a later file cannot recognise this customer, so it may be added twice.');

  const keys = [externalId ? `ext:${externalId.toUpperCase()}` : null, email ? `email:${email}` : null, phone ? `phone:${phoneKey(phone)}` : null].filter((k): k is string => Boolean(k) && !k!.endsWith(':null'));
  const failed = issues.some((i) => i.level === 'error');
  return {
    status: failed ? 'REJECTED' : issues.length ? 'WARNING' : 'GOOD',
    issues,
    keys,
    values: failed ? null : { externalId, fullName, customerType, companyName: customerType === 'ORGANIZATION' ? companyName : null, email, phone, altPhone, address: addr.address, fullAddress: addr.full, taxId: customerType === 'ORGANIZATION' ? taxId : null, tags },
  };
}

const COMMERCIAL = /\b(truck|lorry|bus|minibus|van|pickup|pick-up|tipper|tanker|trailer|tractor|nqr|npr|nkr|nmr|nlr|fvr|fvz|qlr|qmr|qkr|ftr|fvm|cyz|exr|d-?max|canter|fuso|hiace|coaster|aumark|ollin|auman|forland)\b/i;
const PASSENGER = /\b(suv|car|saloon|sedan|hatchback|crossover|jeep|s0?\d|dx\d|mu-?x|pajero|outlander|asx|corolla|camry)\b/i;

export function checkVehicleRow(cells: unknown[], mapping: Mapping, thisYear = new Date().getFullYear()): Checked<VehicleValues> {
  const issues: Issue[] = [];
  const warn = (field: string, message: string) => issues.push({ field, message, level: 'warning' });
  const fail = (field: string, message: string) => issues.push({ field, message, level: 'error' });
  const opt = (key: string, max: number, label: string) => {
    try { return cleanOptional(get(cells, mapping, key), max, label); } catch (e) { warn(key, `${msg(e)} It was left out.`); return null; }
  };

  const custExt = get(cells, mapping, 'customerExternalId').replace(/^0+(?=\d)/, '') || null;
  let custEmail: string | null = null;
  const ce = get(cells, mapping, 'customerEmail');
  if (ce) { try { custEmail = cleanEmail(ce.split(/[;,\s]+/)[0]); } catch { warn('customerEmail', `“${ce}” is not a valid email, so it was not used to find the customer.`); } }
  const custPhone = phoneKey(get(cells, mapping, 'customerPhone'));
  if (!custExt && !custEmail && !custPhone) fail('customer', 'No customer number, email or phone to find whose vehicle this is.');

  const vinRaw = get(cells, mapping, 'chassisNumber');
  const chassisNumber = vinKey(vinRaw);
  if (chassisNumber) {
    if (chassisNumber.length > 30) fail('chassisNumber', 'The chassis number is longer than 30 characters.');
    else if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(chassisNumber)) warn('chassisNumber', `“${vinRaw}” is not a standard 17-character VIN; it was kept as written (older and some commercial chassis numbers differ).`);
  }
  const plateRaw = get(cells, mapping, 'plateNumber');
  const plateNumber = plateRaw ? squash(plateRaw.toUpperCase()) : null;
  if (plateNumber && plateNumber.length > 20) fail('plateNumber', 'The plate is longer than 20 characters.');
  if (!chassisNumber && !plateNumber) fail('chassisNumber', 'No chassis number (VIN) or plate: one of them is needed to know the vehicle.');

  const yearRaw = get(cells, mapping, 'year');
  let year: number | null = null;
  if (yearRaw) {
    const y = Number(String(yearRaw).replace(/[^\d]/g, '').slice(0, 4));
    if (Number.isInteger(y) && y >= 1950 && y <= thisYear + 1) year = y;
    else warn('year', `Year “${yearRaw}” is not a year between 1950 and ${thisYear + 1}; it was left out.`);
  }
  const mileageRaw = get(cells, mapping, 'mileage');
  let mileage: number | null = null;
  if (mileageRaw) {
    const m = Number(mileageRaw.replace(/[,\s]|km$/gi, ''));
    if (Number.isFinite(m) && m >= 0 && m <= 3_000_000) mileage = Math.round(m);
    else warn('mileage', `Mileage “${mileageRaw}” is not a number of kilometres; it was left out.`);
  }

  const make = opt('make', 60, 'Make');
  const model = opt('model', 80, 'Model');
  const typeRaw = get(cells, mapping, 'vehicleType');
  let vehicleType: VehicleValues['vehicleType'] = null;
  if (typeRaw) {
    if (/^(com|truck|bus|van|lorry|cv|lcv|hcv)/i.test(typeRaw)) vehicleType = 'COMMERCIAL';
    else if (/^(pas|car|suv|pc|private)/i.test(typeRaw)) vehicleType = 'PASSENGER';
    else warn('vehicleType', `“${typeRaw}” is not Passenger or Commercial; it was left blank.`);
  }
  if (!vehicleType && model) vehicleType = COMMERCIAL.test(model) ? 'COMMERCIAL' : PASSENGER.test(model) ? 'PASSENGER' : null;

  const externalId = get(cells, mapping, 'externalId').replace(/^0+(?=\d)/, '') || null;
  const keys = [externalId ? `ext:${externalId.toUpperCase()}` : null, chassisNumber ? `vin:${chassisNumber}` : null, plateNumber ? `plate:${plateKey(plateNumber)}` : null].filter((k): k is string => Boolean(k));
  const failed = issues.some((i) => i.level === 'error');
  return {
    status: failed ? 'REJECTED' : issues.length ? 'WARNING' : 'GOOD',
    issues,
    keys,
    values: failed ? null : {
      customer: { externalId: custExt, email: custEmail, phone: custPhone },
      externalId, chassisNumber, plateNumber, engineNumber: opt('engineNumber', 40, 'Engine number'), engineType: opt('engineType', 40, 'Engine type'),
      make, model, year, vehicleType, mileage,
    },
  };
}

export function checkRow(entity: EntityKey, cells: unknown[], mapping: Mapping): Checked<CustomerValues | VehicleValues> {
  return entity === 'customers' ? checkCustomerRow(cells, mapping) : checkVehicleRow(cells, mapping);
}

/** The words for a row's problems, one line (for the screen and the rejects file). */
export function issueText(issues: Issue[] | null | undefined): string {
  return (issues ?? []).map((i) => `${i.level === 'error' ? 'Problem' : 'Note'}: ${i.message}`).join(' | ');
}

export const ENTITY_FIELD_LABEL = (entity: EntityKey, key: string) => ENTITIES[entity].fields.find((f) => f.key === key)?.label ?? key;
