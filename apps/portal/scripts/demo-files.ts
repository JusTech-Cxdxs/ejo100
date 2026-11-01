/**
 * Demo files for showing Data Exchange end to end (docs/DEMO_WALKTHROUGH.md):
 * an SAP-style customers export and a vehicles workbook, with deliberate
 * mistakes for the check to catch. Deterministic (the same files every run),
 * invented names only — no real customer data.
 *
 * One consistent story, so the vehicle page, the customer 360 and the
 * analytics never show an impossible history: every customer is a different
 * person (no two share an email — EJO treats a shared email as the same
 * customer); each vehicle is built and QC'd, then passes PDI, before its
 * first service, and its model year is the year it was built; services are
 * numbered 10,000 km, 20,000 km… in date order and the mileage is past the
 * last one; a customer's "customer since" is never after their first
 * invoice; a PDI report number carries the year of its PDI. Only the
 * deliberate mistakes break these rules.
 *
 * Two folders, from the same data:
 *   docs/demo/correct/        every file loads cleanly — nothing rejected;
 *   docs/demo/with-mistakes/  the same files with planted mistakes, each
 *                             listed (row, what is wrong, what EJO says) in
 *                             its README.md and mistakes.json — for testing
 *                             the check and for the demo.
 * Real events stay in both (a PDI failed then passed, a QC rework, credit
 * notes): they are history, not mistakes.
 *
 *   npx tsx apps/portal/scripts/demo-files.ts        → docs/demo/
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeXlsx } from '../lib/data-exchange/xlsx-writer';
import { toCsv } from '../lib/hq-core';

const ROOT_OUT = join(__dirname, '..', '..', '..', 'docs', 'demo');
const CORRECT = join(ROOT_OUT, 'correct');
const MISTAKES = join(ROOT_OUT, 'with-mistakes');
// The files used to sit directly in docs/demo: clear those so only the two folders remain.
for (const old of ['01_SAP_customers_demo.csv', '02_vehicles_demo.xlsx', '03_SAP_parts_50k.csv', '03a_SAP_parts_200.csv', '04_SAP_opening_stock_demo.csv', '05_SAP_suppliers_demo.csv', '06_SAP_invoice_history_demo.csv', '07_PDI_register_demo.xlsx', '08_production_QC_register_demo.csv']) rmSync(join(ROOT_OUT, old), { force: true });
mkdirSync(CORRECT, { recursive: true });
mkdirSync(MISTAKES, { recursive: true });

/**
 * A planted mistake: the row as written, what is wrong, what EJO says, and
 * where it is caught — the row check ("check"), comparing rows in the same
 * file ("file"), or against what EJO already holds ("database").
 */
type Mistake = { cells: (string | number)[]; what: string; expect: 'rejected' | 'duplicate' | 'warning'; by: 'check' | 'file' | 'database'; says: string };
type Planted = Mistake & { file: string; row: number; entity: string };
const planted: Planted[] = [];
/** Writes a file to both folders: clean rows only in correct/, then the mistakes after them in with-mistakes/. */
function emit(file: string, entity: string, header: string[], clean: (string | number)[][], mistakes: Mistake[], xlsx?: { sheet: string; widths: number[] }) {
  const write = (dir: string, rows: (string | number)[][]) => {
    if (xlsx) writeFileSync(join(dir, file), writeXlsx([{ name: xlsx.sheet, header: true, rows: [header, ...rows], widths: xlsx.widths }]));
    else writeFileSync(join(dir, file), toCsv(header, rows.map((r) => r.map(String))));
  };
  write(CORRECT, clean);
  write(MISTAKES, [...clean, ...mistakes.map((m) => m.cells)]);
  // Row numbers as EJO reports them: the header is row 1, the first data row row 2.
  mistakes.forEach((m, i) => planted.push({ ...m, file, entity, row: clean.length + 2 + i }));
}

const FIRST = ['Adaeze', 'Babatunde', 'Chinedu', 'Damilola', 'Emeka', 'Funke', 'Gbenga', 'Halima', 'Ifeanyi', 'Jumoke', 'Kelechi', 'Lola', 'Musa', 'Ngozi', 'Olumide', 'Patience', 'Rotimi', 'Sadiq', 'Temitope', 'Uche'];
const LAST = ['Okafor', 'Adeyemi', 'Bello', 'Eze', 'Ibrahim', 'Nwosu', 'Ogunleye', 'Abubakar', 'Okonkwo', 'Balogun'];
const STREETS = ['Plot 12, Isolo Industrial Estate', '14 Oshodi-Apapa Expressway', '7 Adeniyi Jones Avenue', '21 Allen Avenue', '3 Ligali Ayorinde Street', '9 Ikorodu Road', '45 Herbert Macaulay Way', '2 Ago Palace Way'];
const CITIES = ['Isolo', 'Ikeja', 'Victoria Island', 'Yaba', 'Surulere', 'Apapa', 'Lekki', 'Oshodi'];
const FLEETS = ['Dangana Haulage', 'Lagoon Logistics', 'Eko Cold Chain', 'Unity Couriers', 'Harbour Freight'];

const kunnr = (n: number) => `000${1000100 + n}`; // SAP keeps leading zeros
const vin = (n: number) => `JAANLR85EL7${String(100000 + n).slice(-6)}`;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, '0');
/** SAP's display day 08.04.2021 (null for the planted day that does not exist). */
function sapDay(s: string): Date | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3]!, +m[2]! - 1, +m[1]!));
  return d.getUTCDate() === +m[1]! ? d : null;
}
const phone = (n: number) => `080${3 + (n % 5)} ${String(200 + n).padStart(3, '0')} ${String(4000 + n * 7).slice(-4)}`;

// ── Invoice history from SAP (billing documents, before EJO 100) ────────
// Two to six invoices a customer between 2020 and September 2026, on their vehicle's VIN, net + tax as SAP's billing
// header has them (NETWR, MWSBK), a few credit notes (G2, trailing minus). Same content every run.
const SERVICES = ['Service 10,000 km', 'Service 20,000 km', 'Service 40,000 km', 'Brake pads and discs', 'Clutch kit replaced', 'Injector cleaning', 'Gearbox overhaul', 'Suspension bushes', 'A/C regas and filter', 'Tyres (6) and alignment'];
const inv: string[][] = [];
let invNo = 90001000;
for (let i = 1; i <= 30; i += 1) {
  const count = 2 + (i % 5);
  for (let k = 0; k < count; k += 1) {
    invNo += 1;
    const y = 2020 + ((i + k * 2) % 7); // 2020 – 2026: the cut-over is recent, so this year has SAP invoices too
    const m = y === 2026 ? 1 + ((i * 3 + k * 5) % 9) : 1 + ((i * 3 + k * 5) % 12); // never later than September 2026
    const d = 1 + ((i * 7 + k * 11) % 27);
    const net = 45000 + ((i * 7919 + k * 104729) % 120) * 7500; // ₦45,000 – ₦937,500
    const tax = Math.round(net * 0.075 * 100) / 100;
    inv.push([String(invNo).padStart(10, '0'), `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`, kunnr(i), net.toFixed(2), tax.toFixed(2), 'NGN', vin(i), 'F2', SERVICES[(i + k) % SERVICES.length]!]);
  }
  if (i % 7 === 0) { invNo += 1; inv.push([String(invNo).padStart(10, '0'), `15.06.${2022 + (i % 3)}`, kunnr(i), '25000.00-', '1875.00-', 'NGN', '', 'G2', 'Credit note: goodwill discount']); }
}
// The planted mistakes (with-mistakes/ only) are added when the file is written, below.
// SAP numbers documents per company code and fiscal year: the same number comes back in a later year (both load, labelled "· 2025" and "· 2026").
inv.push(['0090005000', '20.03.2025', kunnr(2), '64000.00', '4800.00', 'NGN', vin(2), 'F2', 'Wheel alignment']);
inv.push(['0090005000', '18.02.2026', kunnr(2), '71000.00', '5325.00', 'NGN', vin(2), 'F2', 'Service 30,000 km']);
// Services are numbered in date order on each vehicle (10,000 km, 20,000 km…): a later service is never at a lower reading.
const lastServiceKm = new Map<string, number>();
const byVin = new Map<string, string[][]>();
for (const r of inv) if (r[6] && sapDay(r[1]!)) byVin.set(r[6], [...(byVin.get(r[6]) ?? []), r]);
for (const [v, rows] of byVin) {
  let n = 0;
  for (const r of [...rows].sort((a, b) => sapDay(a[1]!)!.getTime() - sapDay(b[1]!)!.getTime() || a[0]!.localeCompare(b[0]!))) {
    if (/^Service [\d,]+ km$/.test(r[8]!)) { n += 1; r[8] = `Service ${(n * 10000).toLocaleString('en-US')} km`; lastServiceKm.set(v, n * 10000); }
  }
}
/** Each vehicle's and each customer's first invoice: the plant built the vehicle before it, the customer was a customer before it. */
const firstInvoiceOfVin = new Map<string, Date>();
const firstInvoiceOf = new Map<string, Date>();
for (const r of inv) {
  const d = sapDay(r[1]!);
  if (!d) continue;
  if (r[6] && (!firstInvoiceOfVin.has(r[6]) || d < firstInvoiceOfVin.get(r[6])!)) firstInvoiceOfVin.set(r[6], d);
  if (!firstInvoiceOf.has(r[2]!) || d < firstInvoiceOf.get(r[2]!)!) firstInvoiceOf.set(r[2]!, d);
}
/** The plant's dates for vehicle i: chassis, trim, then QC (the line's last day), then PDI a few days later — all before its first service. */
function buildOf(i: number): { start: Date; qc: Date; pdi: Date } {
  const first = firstInvoiceOfVin.get(vin(i)) ?? new Date(Date.UTC(2026, 8, 1));
  const qc = addDays(first, -(45 + ((i * 7) % 46)));
  return { start: addDays(qc, -2), qc, pdi: addDays(qc, 2 + (i % 4)) };
}
// Company code 1000 and the fiscal year (here the calendar year) on every line, as a billing extract has them.
const withRange = (r: string[]) => [...r, '1000', (r[1]!.match(/(\d{4})$/) ?? ['', ''])[1]!];
emit('06_SAP_invoice_history_demo.csv', 'invoices', ['VBELN', 'FKDAT', 'KUNAG', 'NETWR', 'MWSBK', 'WAERK', 'VHVIN', 'FKART', 'ARKTX', 'BUKRS', 'GJAHR'], inv.map(withRange), [
  { cells: withRange(['0090009001', '10.10.2024', '0009999999', '150000.00', '11250.00', 'NGN', '', 'F2', 'Unknown customer']), what: 'Customer 0009999999 is not in EJO', expect: 'rejected', by: 'database', says: 'The customer was not found. Import the customers file first, or check the customer number.' },
  { cells: withRange(['0090009002', '11.10.2024', kunnr(3), '2000.00', '0.00', 'USD', '', 'F2', 'Export spare parts']), what: 'Invoice in US dollars', expect: 'rejected', by: 'check', says: 'The amount is in USD. Only naira invoices are loaded: give the amount in the company’s currency (SAP DMBTR) instead.' },
  { cells: withRange(['', '12.10.2024', kunnr(4), '80000.00', '6000.00', 'NGN', '', 'F2', 'No invoice number']), what: 'No invoice number', expect: 'rejected', by: 'check', says: 'Invoice number is required (SAP VBELN or BELNR).' },
  { cells: withRange(['0090009003', '31.06.2024', kunnr(5), '80000.00', '6000.00', 'NGN', '', 'F2', 'No such day']), what: '31 June does not exist', expect: 'rejected', by: 'check', says: '“31.06.2024” is not a date. Write it as 14.03.2019, 14/03/2019, 2019-03-14 or 20190314.' },
  { cells: withRange([inv[0]![0]!, inv[0]![1]!, inv[0]![2]!, inv[0]![3]!, inv[0]![4]!, 'NGN', inv[0]![6]!, 'F2', 'Exported twice']), what: `Invoice ${inv[0]![0]} a second time in the same file`, expect: 'duplicate', by: 'file', says: 'Same invoice number as row 2 of the file; only the first is loaded.' },
]);

// ── Customers (SAP customer master layout) ─────────────────────────────
const custHeader = ['KUNNR', 'NAME1', 'NAME2', 'KTOKD', 'SMTP_ADDR', 'TELF1', 'TELF2', 'STRAS', 'ORT01', 'REGIO', 'STCD1', 'ERDAT'];
const cust: string[][] = [];
for (let i = 1; i <= 30; i += 1) {
  const fleet = i % 6 === 0 ? FLEETS[(i / 6 - 1) % FLEETS.length]! : null;
  // The surname shifts each time the first names come round again, so no two customers share a name (or an email).
  const name = fleet ?? `${FIRST[i % FIRST.length]} ${LAST[(i * 3 + Math.floor(i / FIRST.length)) % LAST.length]}`;
  const email = i % 4 === 0 ? '' : `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.ng`; // a quarter have no email, as in SAP
  const since = `20${String(12 + (i % 12)).padStart(2, '0')}-0${1 + (i % 9)}-1${i % 9}`;
  // Customer since: never after the first invoice (a month before it, when the planned date would be).
  const first = firstInvoiceOf.get(kunnr(i));
  const erdat = first && since > iso(first) ? iso(addDays(first, -30)) : since;
  cust.push([kunnr(i), name, fleet ? 'Ltd' : '', fleet ? 'Company' : 'Individual', email, phone(i), '', STREETS[i % STREETS.length]!, CITIES[i % CITIES.length]!, 'LA', fleet ? `${10000000 + i}-0001` : '', erdat]);
}
emit('01_SAP_customers_demo.csv', 'customers', custHeader, cust, [
  { cells: [kunnr(31), '', '', 'Individual', '', phone(31), '', 'Ikeja', 'Ikeja', 'LA', '', '2020-01-10'], what: 'No name', expect: 'rejected', by: 'check', says: 'Name is required.' },
  { cells: [kunnr(32), 'Yetunde Afolabi', '', 'Individual', 'yetunde.afolabi@@example', phone(32), '', '5 Opebi Road', 'Ikeja', 'LA', '', '2021-06-02'], what: 'Email with two @ and no domain', expect: 'warning', by: 'check', says: '“yetunde.afolabi@@example” is not a valid email, so the customer was kept without one (no portal access until it is corrected).' },
  { cells: [kunnr(5), 'Duplicate Of Row Six', '', 'Individual', '', '', '', '', '', '', '', ''], what: `Customer number ${kunnr(5)} a second time (row 6 has it)`, expect: 'duplicate', by: 'file', says: 'Same customer number as row 6 of the file; only the first is loaded.' },
]);

// ── Vehicles (Excel workbook) ──────────────────────────────────────────
const MODELS: [string, string, string, number][] = [['Isuzu', 'NQR 71', 'Commercial', 2024], ['Isuzu', 'NPR 71', 'Commercial', 2023], ['Isuzu', 'QLR 55', 'Commercial', 2025], ['Isuzu', 'QMR 55', 'Commercial', 2024], ['Soueast', 'S07', 'Passenger', 2025]];
const vehRows: (string | number)[][] = [['Customer number', 'VIN', 'Plate', 'Engine number', 'Make', 'Model', 'Category', 'Year', 'Mileage']];
for (let i = 1; i <= 30; i += 1) {
  const [make, model, cat] = MODELS[i % MODELS.length]!;
  // Model year: the year it was built. Mileage: past its last service.
  const year = buildOf(i).start.getUTCFullYear();
  const mileage = (lastServiceKm.get(vin(i)) ?? 5000) + 1500 + (i % 5) * 700;
  vehRows.push([kunnr(i), vin(i), `LND ${100 + i} ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(66 + (i % 24))}`, make === 'Isuzu' ? `4JJ1-${500000 + i}` : `F4J16-${700000 + i}`, make, model, cat, year, mileage]);
}
const [vehHeader, ...vehClean] = vehRows as [string[], ...(string | number)[][]];
emit('02_vehicles_demo.xlsx', 'vehicles', vehHeader, vehClean, [
  { cells: [kunnr(7), vin(3), '', '', 'Isuzu', 'NPR 71', 'Commercial', 2023, 900], what: `VIN ${vin(3)} a second time (row 4 has it)`, expect: 'duplicate', by: 'file', says: 'Same chassis number as row 4 of the file; only the first is loaded.' },
  { cells: [kunnr(8), '', '', '', 'Soueast', 'S07', 'Passenger', 2025, 50], what: 'Neither a VIN nor a plate', expect: 'rejected', by: 'check', says: 'No chassis number (VIN) or plate: one of them is needed to know the vehicle.' },
  { cells: ['0009999999', vin(99), 'KJA 999 ZZ', '', 'Isuzu', 'QMR 55', 'Commercial', 2024, 300], what: 'Customer 0009999999 is not in EJO', expect: 'rejected', by: 'database', says: 'The customer was not found. Import the customers file first, or check the customer number, email or phone.' },
], { sheet: 'Vehicles', widths: [18, 22, 14, 16, 10, 10, 12, 8, 10] });

// ── Suppliers (SAP vendor master) ──────────────────────────────────────
const VENDORS: [string, string, string, string][] = [
  ['Isuzu Motors', 'International Operations', 'Tokyo', 'orders.isuzu@example.com'], ['Isuzu East Africa', 'Parts Division', 'Nairobi', 'parts.iea@example.com'],
  ['Soueast Motor', 'Export Department', 'Fuzhou', 'export.soueast@example.com'], ['Bosch Automotive', 'Aftermarket West Africa', 'Lagos', 'aftermarket@example.com'],
  ['Total Energies Lubricants', 'Lagos Depot', 'Apapa', 'lubes@example.com'], ['Michelin Tyres', 'Nigeria Distribution', 'Ikeja', 'tyres@example.com'],
  ['Exide Batteries', 'Lagos Branch', 'Ikeja', 'batteries@example.com'], ['Denso Filters', 'Distributor Lagos', 'Oshodi', 'filters@example.com'],
  ['Lagos Fasteners', '', 'Isolo', 'sales@lagosfasteners.example.ng'], ['Eko Paints & Coatings', '', 'Ilupeju', 'orders@ekopaints.example.ng'],
];
emit('05_SAP_suppliers_demo.csv', 'suppliers', ['LIFNR', 'NAME1', 'NAME2', 'ORT01', 'SMTP_ADDR', 'TELF1'], VENDORS.map(([n1, n2, city, mail], i) => [`00003000${String(41 + i).padStart(2, '0')}`, n1, n2, city, mail, `+234 1 270 ${String(1000 + i * 37).slice(-4)}`]), [
  { cells: ['0000300099', '', '', 'Lagos', 'unknown@example.com', '+234 1 270 9999'], what: 'No supplier name', expect: 'rejected', by: 'check', says: 'Name is required.' },
  { cells: ['0000300041', 'Isuzu Motors (again)', '', 'Tokyo', 'orders2.isuzu@example.com', ''], what: 'Supplier number 0000300041 a second time (row 2 has it)', expect: 'duplicate', by: 'file', says: 'Same supplier number as row 2 of the file; only the first is loaded.' },
]);

// ── Parts (SAP material master) ────────────────────────────────────────
// Isuzu-style part numbers (8-98123456-0), Soueast-style (S07-3501100), and generic consumables.
const GROUPS: [string, string, string, number][] = [
  ['BRAKES', 'Brake pad set', 'ST', 45000], ['BRAKES', 'Brake shoe kit', 'SET', 38000], ['FILTERS', 'Oil filter', 'ST', 6500], ['FILTERS', 'Fuel filter element', 'ST', 9800],
  ['FILTERS', 'Air filter element', 'ST', 14500], ['ENGINE', 'Fan belt', 'ST', 12000], ['ENGINE', 'Water pump assembly', 'ST', 96000], ['ENGINE', 'Injector nozzle', 'ST', 72000],
  ['ELECTRICAL', 'Headlamp assembly', 'ST', 88000], ['ELECTRICAL', 'Alternator', 'ST', 245000], ['SUSPENSION', 'Shock absorber, front', 'ST', 54000], ['SUSPENSION', 'Leaf spring bush', 'ST', 4800],
  ['STEERING', 'Tie rod end', 'ST', 21000], ['BODY', 'Side mirror, left', 'ST', 36000], ['LUBES', 'Engine oil 15W-40', 'L', 4200], ['LUBES', 'Gear oil 80W-90', 'L', 4800],
  ['TYRES', 'Tyre 215/75 R17.5', 'ST', 185000], ['BATTERY', 'Battery 12V 100Ah', 'ST', 165000], ['FASTENERS', 'Wheel nut M20', 'ST', 900], ['COOLANT', 'Coolant concentrate', 'L', 3600],
];
const MODELS_FOR = ['NQR', 'NPR', 'QLR', 'QMR', 'S07'];
function partRow(i: number): string[] {
  const [group, desc, unit, price] = GROUPS[i % GROUPS.length]!;
  const model = MODELS_FOR[Math.floor(i / GROUPS.length) % MODELS_FOR.length]!;
  const number = model === 'S07' ? `S07-${String(3500000 + i).slice(-7)}` : `8-98${String(100000 + i).padStart(6, '0').slice(-6)}-${i % 10}`;
  const batch = group === 'LUBES' || group === 'COOLANT' ? 'X' : '';
  const alt = group === 'LUBES' ? ['DR', '208'] : group === 'FASTENERS' ? ['BOX', '100'] : ['', ''];
  return [number, `${desc} (${model})`, group, unit, batch, i % 7 === 0 ? `${6900000000000 + i}` : '', String(Math.round(price * (1 + (i % 13) / 20))), String(2 + (i % 6)), String(1 + (i % 3)), alt[0]!, alt[1]!];
}
const PART_HEADER = ['MATNR', 'MAKTX', 'MATKL', 'MEINS', 'XCHPF', 'EAN11', 'VKP', 'MINBE', 'EISBE', 'MEINH', 'UMREZ'];
function writeParts(n: number, file: string) {
  // Streamed in slices so even 800,000 rows never sit in memory at once.
  const { openSync, writeSync, closeSync } = require('node:fs') as typeof import('node:fs');
  const fd = openSync(file, 'w');
  writeSync(fd, toCsv(PART_HEADER, []));
  for (let from = 0; from < n; from += 20000) {
    const rows: string[][] = [];
    for (let i = from; i < Math.min(n, from + 20000); i += 1) rows.push(partRow(i));
    writeSync(fd, toCsv(PART_HEADER, rows).replace(/^\uFEFF[^\r]*\r\n/, ''));
  }
  closeSync(fd);
}
const DEMO_PARTS = 50_000;
// The 50,000-part file has no planted mistakes: correct/ only (one 4 MB copy is enough).
writeParts(DEMO_PARTS, join(CORRECT, '03_SAP_parts_50k.csv'));
// A small file for a quick first try — and, in with-mistakes/, the parts check's mistakes.
emit('03a_SAP_parts_200.csv', 'parts', PART_HEADER, Array.from({ length: 200 }, (_, i) => partRow(i)), [
  { cells: ['', 'Brake pad set (no number)', 'BRAKES', 'ST', '', '', '45000', '2', '1', '', ''], what: 'No part number', expect: 'rejected', by: 'check', says: 'Part number is required.' },
  { cells: ['8-98999001-1', '', 'BRAKES', 'ST', '', '', '45000', '2', '1', '', ''], what: 'No description', expect: 'rejected', by: 'check', says: 'Description is required.' },
  { cells: [partRow(0)[0]!, 'Brake pad set (NQR) — again', 'BRAKES', 'ST', '', '', '45000', '2', '1', '', ''], what: `Part number ${partRow(0)[0]} a second time (row 2 has it)`, expect: 'duplicate', by: 'file', says: 'Same part number (SAP material number) as row 2 of the file; only the first is loaded.' },
  { cells: ['8-98999002-2', 'Oil filter (price typo)', 'FILTERS', 'ST', '', '', '-6500', '2', '1', '', ''], what: 'A negative selling price', expect: 'warning', by: 'check', says: 'Selling price “-6500” is not an amount; it was left out.' },
]);

// ── Opening stock (SAP stock with valuation) ───────────────────────────
const stock: string[][] = [];
for (let i = 0; i < 2_000; i += 1) {
  const p = partRow(i * 7);
  const qty = p[3] === 'L' ? 208 * (1 + (i % 4)) : 2 + (i % 25);
  const unitCost = Math.round(Number(p[6]) * 0.72);
  const batched = p[4] === 'X';
  stock.push([p[0]!, String(qty), p[3]!, (qty * unitCost).toFixed(2), String(unitCost), '1', batched ? `B2026${String(i).padStart(5, '0')}` : '', i % 3 === 0 ? '0002' : '0001']);
}
emit('04_SAP_opening_stock_demo.csv', 'stock', ['MATNR', 'LABST', 'MEINS', 'SALK3', 'VERPR', 'PEINH', 'CHARG', 'LGORT'], stock, [
  { cells: [partRow(5)[0]!, '3-', 'ST', '0', '', '1', '', '0001'], what: 'Negative stock (SAP writes it 3-)', expect: 'rejected', by: 'check', says: 'Negative stock (3-) cannot be an opening balance; correct it in SAP or leave the line out.' },
  { cells: ['9-99999999-9', '4', 'ST', '20000.00', '5000', '1', '', '0001'], what: 'Part 9-99999999-9 is not in the catalogue', expect: 'rejected', by: 'database', says: 'Part 9-99999999-9 is not in this branch’s catalogue. Import the parts file first, or check the number.' },
  { cells: [partRow(9)[0]!, '6', 'ST', '', '', '', '', '0001'], what: 'No value and no unit cost', expect: 'rejected', by: 'check', says: 'No cost: give the stock value or the unit cost (stock is valued at what it cost).' },
  { cells: [partRow(14)[0]!, '208', 'L', '873600.00', '4200', '1', '', '0001'], what: 'A batch-managed oil without its batch', expect: 'rejected', by: 'database', says: 'This part is batch-tracked: give the batch number (SAP CHARG).' },
]);

// ── The plant's registers (Excel, as kept on the line today) ────────────
// PDI register: one workbook, no "register" column (chosen when importing). Two steps per vehicle.
const INSPECTORS = ['A. Bello', 'C. Okoro', 'F. Adebayo', 'M. Yusuf'];
const pdi: (string | number)[][] = [['VIN', 'Model', 'PDI date', 'Step', 'Result', 'Inspected by', 'Report no', 'Remarks']];
for (let i = 1; i <= 30; i += 1) {
  const [, model] = MODELS[i % MODELS.length]!;
  const d = buildOf(i).pdi;
  const date = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  const insp = INSPECTORS[i % INSPECTORS.length]!;
  const report = `PDI-${d.getUTCFullYear()}-${String(i).padStart(4, '0')}`;
  pdi.push([vin(i), model, date, 'Final inspection', i % 9 === 0 ? 'NG' : 'OK', insp, report, i % 9 === 0 ? 'Door seal leaking; rectified and re-inspected' : '']);
  pdi.push([vin(i), model, date, 'Road test', 'OK', insp, report, '']);
}
const [pdiHeader, ...pdiClean] = pdi as [string[], ...(string | number)[][]];
emit('07_PDI_register_demo.xlsx', 'registers', pdiHeader, pdiClean, [
  { cells: ['', 'NQR 71', '02/02/2024', 'Road test', 'OK', 'A. Bello', 'PDI-2024-9999', 'No VIN written'], what: 'No VIN', expect: 'rejected', by: 'check', says: 'Chassis number (VIN) is required.' },
  { cells: [vin(4), 'QMR 55', '30/02/2024', 'Final inspection', 'OK', 'C. Okoro', 'PDI-2024-9998', 'Date typo'], what: '30 February does not exist', expect: 'rejected', by: 'check', says: '“30/02/2024” is not a date. Write it as 14.03.2019, 14/03/2019, 2019-03-14 or 20190314.' },
], { sheet: 'PDI register', widths: [22, 10, 12, 16, 8, 14, 14, 40] });

// Production and QC register: one sheet with a "Register" column (line stations, then the QC gates).
const prod: string[][] = [];
for (let i = 1; i <= 30; i += 1) {
  const [, model] = MODELS[i % MODELS.length]!;
  const { start, qc } = buildOf(i);
  const day = (d: Date) => iso(d).replace(/-/g, ''); // SAP's 20240205
  prod.push(['Production', vin(i), model, day(start), 'Chassis and frame', 'Pass', 'Line 1', '']);
  prod.push(['Production', vin(i), model, day(addDays(start, 1)), 'Trim and final assembly', 'Pass', 'Line 1', '']);
  prod.push(['QC', vin(i), model, day(qc), 'Water test', i % 11 === 0 ? 'Rework' : 'Pass', INSPECTORS[(i + 1) % INSPECTORS.length]!, i % 11 === 0 ? 'Windscreen seal resealed' : '']);
  prod.push(['QC', vin(i), model, day(qc), 'Final QC gate', 'Pass', INSPECTORS[(i + 2) % INSPECTORS.length]!, '']);
}
emit('08_production_QC_register_demo.csv', 'registers', ['Register', 'VIN', 'Model', 'Date', 'Station', 'Result', 'Inspected by', 'Remarks'], prod, [
  { cells: ['Production', vin(6), 'NQR 71', '', 'Chassis and frame', 'Pass', 'Line 1', 'Date left out'], what: 'No date', expect: 'rejected', by: 'check', says: 'Date is required.' },
  { cells: ['Paint shop', vin(6), 'NQR 71', '20240301', 'Top coat', 'Pass', 'Line 2', 'Not one of the registers'], what: 'Register "Paint shop" is not Production, QC or PDI', expect: 'rejected', by: 'check', says: '“Paint shop” is not Production, QC or PDI.' },
]);

// The 800,000-row file for the measured speed run (not committed): PERF_PARTS=800000 PERF_OUT=/some/dir
if (process.env.PERF_PARTS && process.env.PERF_OUT) {
  writeParts(Number(process.env.PERF_PARTS), join(process.env.PERF_OUT, `SAP_parts_${process.env.PERF_PARTS}.csv`));
  console.log(`Speed-run file: ${process.env.PERF_PARTS} parts in ${process.env.PERF_OUT}`);
}

// ── What is planted where (with-mistakes/), and what each folder is for ──
writeFileSync(join(MISTAKES, 'mistakes.json'), `${JSON.stringify(planted.map(({ file, row, entity, what, expect, by, says }) => ({ file, row, entity, what, expect, by, says })), null, 2)}\n`);
const BY = { check: 'the check (this row alone)', file: 'the check (against the other rows in the file)', database: 'the check (against what EJO already holds)' } as const;
const files = [...new Set(planted.map((p) => p.file))].sort();
writeFileSync(join(MISTAKES, 'README.md'), `# Demo files with planted mistakes

The same files as in [\`../correct/\`](../correct/), with mistakes added at the
end of each file, so the import's check has something to catch. Use these to
test the check and to show it in the demo; use \`correct/\` to load the demo
data cleanly. Row numbers are as EJO reports them ("Row in your file": the
header is row 1). The same list is in \`mistakes.json\` (the tests read it).

Mistakes marked *against what EJO already holds* show when the file is
checked after the files it depends on are loaded (customers before vehicles
and invoices, the parts catalogue before opening stock).

${files.map((f) => `## ${f}\n\n| Row | What is wrong | EJO says | Outcome | Caught by |\n| --- | --- | --- | --- | --- |\n${planted.filter((p) => p.file === f).map((p) => `| ${p.row} | ${p.what} | ${p.says} | ${p.expect === 'duplicate' ? 'Duplicate (not loaded)' : p.expect === 'warning' ? 'Loaded with a note' : 'Rejected (not loaded)'} | ${BY[p.by]} |`).join('\n')}\n`).join('\n')}
`);
writeFileSync(join(CORRECT, 'README.md'), `# Demo files in the correct format

Every file here loads cleanly: no row is rejected or a duplicate. The only notes
the check shows are on the four credit notes (“kept as a credit note”). Load them in
this order (later files refer to earlier ones):

1. \`01_SAP_customers_demo.csv\` — Customers (SAP)
2. \`02_vehicles_demo.xlsx\` — Vehicles
3. \`05_SAP_suppliers_demo.csv\` — Suppliers (SAP)
4. \`03a_SAP_parts_200.csv\` (a quick first try) or \`03_SAP_parts_50k.csv\` — Parts (SAP)
5. \`04_SAP_opening_stock_demo.csv\` — Opening stock (needs the 50,000 parts)
6. \`06_SAP_invoice_history_demo.csv\` — Invoice history (SAP)
7. \`07_PDI_register_demo.xlsx\` and \`08_production_QC_register_demo.csv\` — Registers

Real events are part of the story and load as they are: a PDI that failed and
was re-inspected, a QC rework, credit notes (G2). The same files with planted
mistakes are in [\`../with-mistakes/\`](../with-mistakes/).
`);
writeFileSync(join(ROOT_OUT, 'README.md'), `# Demo files

Invented data only (no real customer), the same on every run of
\`npx tsx apps/portal/scripts/demo-files.ts\`.

| Folder | Use it to |
| --- | --- |
| [\`correct/\`](correct/) | load the demo data cleanly — every row is accepted |
| [\`with-mistakes/\`](with-mistakes/) | test the import's check — the same data plus ${planted.length} planted mistakes, each listed with its row and what EJO says |

The walkthrough ([\`docs/DEMO_WALKTHROUGH.md\`](../DEMO_WALKTHROUGH.md)) uses
\`with-mistakes/\` where it shows the check catching problems.
`);
console.log(`Demo files written to ${CORRECT} and ${MISTAKES} (${planted.length} planted mistakes)`);
