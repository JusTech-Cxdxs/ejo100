/**
 * Updating records from an edited export (P10, the round trip). An export of
 * customers, vehicles, parts or suppliers carries each record's EJO number
 * ("EJO record", ZZ_EJO_ID); edited in Excel and uploaded again with "Update
 * records exported from EJO", each row is found by that number only — never
 * by a name, a phone or a guess — and compared with the record as it is now.
 * Only real changes count (a phone written another way, a plate with a space,
 * a SAP number with its leading zeros are the same value), an empty cell
 * leaves the field as it is (nothing is ever blanked by a file), and what
 * identifies the record (a part's number, a vehicle's chassis number) is
 * never changed by a file. Every change is previewed before approval as
 * "from → to"; the load applies only the ones still true (a field changed in
 * EJO since the check is left as it is); undo puts back the "from".
 *
 * Pure: the server part is round-trip-server.ts.
 */
import { cellText, phoneKey, type Issue } from './check';
import type { EntityKey, Mapping } from './fields';
import type { CustomerValues, VehicleValues } from './check';
import type { PartValues, SupplierValues } from './check-inventory';

export const ROUND_TRIP_ENTITIES = ['customers', 'vehicles', 'parts', 'suppliers'] as const;
export type RoundTripEntity = (typeof ROUND_TRIP_ENTITIES)[number];
export const isRoundTripEntity = (e: string): e is RoundTripEntity => (ROUND_TRIP_ENTITIES as readonly string[]).includes(e);

/** A value as it is compared and stored: text, a number, a day (YYYY-MM-DD) or nothing. */
export type Plain = string | number | null;
export type Change = { field: string; label: string; from: Plain; to: Plain };

type Spec = {
  field: string;
  label: string;
  /** The file's column(s) for it: the change counts only when one of them is matched and has a value. */
  cols: string[];
  /** The two values are the same thing written differently. */
  same?: (a: Plain, b: Plain) => boolean;
};

const text = (v: Plain) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
const ci = (a: Plain, b: Plain) => text(a).toLowerCase() === text(b).toLowerCase();
const phone = (a: Plain, b: Plain) => (phoneKey(text(a)) ?? text(a)) === (phoneKey(text(b)) ?? text(b));
const code = (a: Plain, b: Plain) => text(a).toUpperCase().replace(/[\s-]/g, '').replace(/^0+(?=\w)/, '') === text(b).toUpperCase().replace(/[\s-]/g, '').replace(/^0+(?=\w)/, '');
const num = (a: Plain, b: Plain) => (a === null || a === '' ? null : Number(a)) === (b === null || b === '' ? null : Number(b));

/** What a file may change on each kind of record, in the order the preview lists it. */
export const UPDATABLE: Record<RoundTripEntity, Spec[]> = {
  customers: [
    { field: 'fullName', label: 'Name', cols: ['fullName'] },
    { field: 'phone', label: 'Phone', cols: ['phone'], same: phone },
    { field: 'altPhone', label: 'Second phone', cols: ['altPhone'], same: phone },
    { field: 'email', label: 'Email', cols: ['email'], same: ci },
    { field: 'address', label: 'Address', cols: ['address'] },
    { field: 'customerSince', label: 'Customer since', cols: ['customerSince'] },
    { field: 'externalId', label: 'Customer number (SAP or old system)', cols: ['externalId'], same: code },
  ],
  vehicles: [
    { field: 'plateNumber', label: 'Plate', cols: ['plateNumber'], same: code },
    { field: 'chassisNumber', label: 'Chassis number (VIN)', cols: ['chassisNumber'], same: code },
    { field: 'engineNumber', label: 'Engine number', cols: ['engineNumber'], same: code },
    { field: 'engineType', label: 'Engine type', cols: ['engineType'], same: ci },
    { field: 'make', label: 'Make', cols: ['make'], same: ci },
    { field: 'model', label: 'Model', cols: ['model'], same: ci },
    { field: 'year', label: 'Year', cols: ['year'], same: num },
    { field: 'vehicleType', label: 'Category', cols: ['vehicleType'] },
    { field: 'mileage', label: 'Mileage (km)', cols: ['mileage'], same: num },
    { field: 'externalId', label: 'Vehicle number (SAP or old system)', cols: ['externalId'], same: code },
  ],
  parts: [
    { field: 'name', label: 'Description', cols: ['name'] },
    { field: 'category', label: 'Material group / category', cols: ['category'], same: ci },
    { field: 'barcode', label: 'Barcode', cols: ['barcode'], same: code },
    { field: 'sellingPrice', label: 'Selling price (₦)', cols: ['sellingPrice'], same: num },
    { field: 'reorderPoint', label: 'Reorder point', cols: ['reorderPoint'], same: num },
    { field: 'safetyStock', label: 'Safety stock', cols: ['safetyStock'], same: num },
    { field: 'externalId', label: 'Number in SAP or the old system', cols: ['externalId'], same: code },
  ],
  suppliers: [
    { field: 'name', label: 'Name', cols: ['name', 'name2'] },
    { field: 'contactName', label: 'Contact person', cols: ['contactName'] },
    { field: 'phone', label: 'Phone', cols: ['phone'], same: phone },
    { field: 'email', label: 'Email', cols: ['email'], same: ci },
    { field: 'address', label: 'Address', cols: ['address', 'city'] },
    { field: 'taxId', label: 'Tax ID', cols: ['taxId'], same: code },
    { field: 'externalId', label: 'Supplier number (SAP or old system)', cols: ['externalId'], same: code },
  ],
};

/** The row's EJO record number (a cuid), or null when the column is empty or not one. */
export function ejoRecordOf(cells: unknown[], mapping: Mapping): string | null {
  const i = mapping.ejoRecord;
  const v = typeof i === 'number' ? cellText(cells[i]).trim() : '';
  return /^[a-z0-9]{8,40}$/i.test(v) ? v : null;
}

type Values = CustomerValues | VehicleValues | PartValues | SupplierValues;

/** The file's value for a field, as stored. */
function fileValue(entity: RoundTripEntity, v: Values, field: string): Plain {
  const x = (v as Record<string, unknown>)[field];
  if (x === undefined || x === null || x === '') return null;
  return typeof x === 'number' ? x : String(x);
}

/**
 * The changes one row asks for, compared with the record as it is now
 * (`current`, in the same plain form). Never blanks a field; never changes
 * what identifies the record; an odometer never goes back.
 */
export function diffRecord(entity: RoundTripEntity, current: Record<string, Plain>, values: Values, cells: unknown[], mapping: Mapping): { changes: Change[]; errors: string[]; notes: Issue[] } {
  const changes: Change[] = [];
  const errors: string[] = [];
  const notes: Issue[] = [];
  const present = (cols: string[]) => cols.some((c) => typeof mapping[c] === 'number' && cellText(cells[mapping[c] as number]) !== '');
  // What identifies the record is never changed by a file.
  if (entity === 'parts') {
    const p = values as PartValues;
    if (present(['partNumber']) && !code(p.partNumber, current.partNumber ?? null)) errors.push(`The part number is how the Store knows this part (${current.partNumber ?? 'none'}): it is never changed by a file. Change it on the part’s page, or put ${current.partNumber ?? 'it'} back.`);
    if (present(['trackingType']) && p.trackingType !== current.trackingType) notes.push({ field: 'trackingType', level: 'warning', message: 'How the part is tracked is changed on its page (stock depends on it), never by a file: left as it is.' });
    if (present(['baseUnit']) && !ci(p.baseUnit, current.baseUnitOfMeasure ?? null)) notes.push({ field: 'baseUnit', level: 'warning', message: 'The base unit is changed on the part’s page (stock is counted in it), never by a file: left as it is.' });
  }
  for (const s of UPDATABLE[entity]) {
    if (!present(s.cols)) continue;
    const to = fileValue(entity, values, s.field);
    if (to === null) continue;
    const from = current[s.field] ?? null;
    if ((s.same ?? ((a, b) => text(a) === text(b)))(from, to)) continue;
    if (entity === 'vehicles' && s.field === 'chassisNumber' && from) { errors.push(`The chassis number is the vehicle (${from}): it is never changed by a file. Put it back, or correct it on the vehicle’s page.`); continue; }
    if (entity === 'vehicles' && s.field === 'mileage' && typeof from === 'number' && typeof to === 'number' && to < from) { notes.push({ field: 'mileage', level: 'warning', message: `Mileage ${to.toLocaleString('en-NG')} km is lower than EJO’s ${from.toLocaleString('en-NG')} km (an odometer only goes up): left as it is.` }); continue; }
    changes.push({ field: s.field, label: s.label, from, to });
  }
  return { changes, errors, notes };
}

/** "Phone: 0803 123 4567 → 0805 222 1111" — a change as the preview and the report say it. */
export function changeWords(c: Change): string {
  const v = (x: Plain) => (x === null || x === '' ? '(empty)' : typeof x === 'number' ? x.toLocaleString('en-NG') : x);
  return `${c.label}: ${v(c.from)} → ${v(c.to)}`;
}

export const roundTripEntityOf = (e: EntityKey): RoundTripEntity | null => (isRoundTripEntity(e) ? e : null);
