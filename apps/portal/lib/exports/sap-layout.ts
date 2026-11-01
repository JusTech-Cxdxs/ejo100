/**
 * Exports — "SAP field names": the same list, with SAP's own column names
 * (KUNNR, NAME1, MATNR…) instead of EJO's plain-English ones. Pure.
 *
 * What it is for: handing records to the SAP team — customers created in
 * EJO that SAP does not have yet (KUNNR empty), parts, suppliers, stock to
 * compare. SAP's team loads such a file with their own tools (Migration
 * Cockpit, LSMW or a program of theirs); EJO never writes into SAP.
 *
 * The rules:
 *  • Only the columns SAP has a field for (no links, no EJO-only figures).
 *  • Days as SAP writes them in flat files: YYYYMMDD.
 *  • Yes / No as SAP's flags: X / empty.
 *  • Customer, supplier and billing numbers in SAP's internal form: all
 *    digits are padded with leading zeros to 10 (1000101 → 0001000101).
 *    EJO stores them without the zeros (so either form finds the record).
 *  • No "#" lines above the header in CSV: line 1 is the header, as SAP
 *    load tools expect.
 *  • ZZ_EJO_ID (SAP's customer namespace for extra fields) carries the EJO
 *    record, so a file SAP sends back can be matched to it.
 *
 * Every SAP name here is one EJO's own import recognises, so a file in this
 * layout comes straight back into Data Exchange.
 */
import type { ColumnType, ExportColumn } from './format';

export const LAYOUTS = ['ejo', 'sap'] as const;
export type Layout = (typeof LAYOUTS)[number];

/** For each list that has an SAP layout: EJO's column header → SAP's field name. Order follows the list's own columns. */
export const SAP_FIELDS: Record<string, Record<string, string>> = {
  customers: {
    'Customer number (SAP or old system)': 'KUNNR',
    Name: 'NAME1',
    Type: 'KTOKD',
    Email: 'SMTP_ADDR',
    Phone: 'TELF1',
    'Second phone': 'TELF2',
    Address: 'STRAS',
    'Tax ID': 'STCD1',
    'Customer since': 'ERDAT',
    'EJO record': 'ZZ_EJO_ID',
  },
  vehicles: {
    'Customer number (SAP or old system)': 'KUNNR',
    'Vehicle number (SAP or old system)': 'EQUNR',
    'Chassis number (VIN)': 'VHVIN',
    Plate: 'LICENSE_NUM',
    'Engine number': 'ENGINE_NO',
    Make: 'MAKE',
    Model: 'MODEL',
    Year: 'MODEL_YEAR',
    'Mileage (km)': 'MILEAGE',
    'EJO record': 'ZZ_EJO_ID',
  },
  parts: {
    'Part number': 'MATNR',
    Description: 'MAKTX',
    'Material group / category': 'MATKL',
    'Base unit': 'MEINS',
    'Batch managed': 'XCHPF',
    Barcode: 'EAN11',
    'Selling price': 'KBETR',
    Currency: 'WAERS',
    'Reorder point': 'MINBE',
    'Safety stock': 'EISBE',
    'EJO record': 'ZZ_EJO_ID',
  },
  suppliers: {
    'Supplier number (SAP or old system)': 'LIFNR',
    Name: 'NAME1',
    Phone: 'TELF1',
    Email: 'SMTP_ADDR',
    Address: 'STRAS',
    'Tax ID': 'STCD1',
    'EJO record': 'ZZ_EJO_ID',
  },
  stock: {
    'Part number': 'MATNR',
    Description: 'MAKTX',
    Unit: 'MEINS',
    'On hand': 'LABST',
    'Stock value (FIFO cost)': 'SALK3',
    'Average cost': 'VERPR',
    Currency: 'WAERS',
  },
  'sap-invoices': {
    'Invoice number': 'VBELN',
    'Fiscal year': 'GJAHR',
    'Company code': 'BUKRS',
    'Document type': 'FKART',
    'Invoice date': 'FKDAT',
    'Customer number (SAP)': 'KUNAG',
    'Chassis number (VIN)': 'VHVIN',
    'Amount (incl. tax)': 'DMBTR',
    Currency: 'WAERS',
    Description: 'ARKTX',
  },
};

/** SAP number fields kept with leading zeros (ALPHA conversion) when the value is all digits: field → length. */
const ALPHA: Record<string, number> = { KUNNR: 10, KUNAG: 10, LIFNR: 10, VBELN: 10 };
/** "1000101" → "0001000101" for a numeric SAP number; anything else unchanged. */
export function alpha(field: string, v: unknown): unknown {
  const len = ALPHA[field];
  if (!len || v === null || v === undefined) return v;
  const s = String(v).trim();
  return /^\d+$/.test(s) && s.length < len ? s.padStart(len, '0') : s;
}

export const hasSapLayout = (kind: string): boolean => kind in SAP_FIELDS;
export const isLayout = (x: unknown): x is Layout => (LAYOUTS as readonly string[]).includes(String(x));

/** A value as SAP flat files write it: days YYYYMMDD, flags X / empty; everything else unchanged. */
export function sapValue(type: ColumnType, v: unknown): { type: ColumnType; value: unknown } {
  if (v === null || v === undefined || v === '') return { type: type === 'day' || type === 'date' || type === 'datetime' || type === 'bool' ? 'code' : type, value: null };
  if (type === 'bool') return { type: 'code', value: v ? 'X' : '' };
  if (type === 'day' || type === 'date' || type === 'datetime') {
    let d: Date | null = null;
    if (v instanceof Date) d = v;
    else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) d = new Date(v.length === 10 ? `${v}T00:00:00.000Z` : v);
    if (!d || Number.isNaN(d.getTime())) return { type: 'code', value: null };
    // A calendar day ("day") is stored at UTC midnight; a moment is read as its Lagos day.
    const shifted = type === 'day' || (typeof v === 'string' && v.length === 10) ? d : new Date(d.getTime() + 3_600_000);
    return { type: 'code', value: shifted.toISOString().slice(0, 10).replace(/-/g, '') };
  }
  return { type, value: v };
}

/** The list's columns in the chosen layout: EJO's as they are, or only the SAP ones, renamed, with SAP's values. */
export function columnsFor<R>(kind: string, columns: ExportColumn<R>[], layout: Layout): ExportColumn<R>[] {
  const map = SAP_FIELDS[kind];
  if (layout !== 'sap' || !map) return columns;
  return columns
    .filter((c) => c.header in map)
    .map((c) => {
      const t = c.type;
      const field = map[c.header]!;
      return {
        header: field,
        type: t === 'day' || t === 'date' || t === 'datetime' || t === 'bool' ? 'code' : t === 'link' ? 'text' : t,
        width: Math.max(10, (c.width ?? 12) - 2),
        get: (r: R) => alpha(field, sapValue(t, c.get(r)).value),
      } as ExportColumn<R>;
    });
}
