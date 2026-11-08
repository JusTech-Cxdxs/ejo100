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
import { DEMO_PEOPLE, planPlantDemo } from '../lib/plant/demo/plan';

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

// ── Job card history from SAP (PM/CS service orders, before EJO 100) ─────
// One job card per invoice above: the workshop only ever had job cards (6-digit SAP order numbers) with "Carry out service" or the
// repair written on them. Opened a day or three before the invoice, completed on the invoice day, the mileage at the visit in step
// with the services (10,000 km, 20,000 km…), the technician by name (staff see it, customers never do), the invoice it was billed on.
const TECHS = ['E. Okoro', 'B. Musa', 'T. Adesanya', 'K. Nwachukwu', 'S. Lawal'];
const jobRows: string[][] = [];
let aufnr = 480_100;
for (const r of inv) {
  if (r[7] !== 'F2' || !r[6] || !sapDay(r[1]!)) continue; // credit notes and the planted rows carry no job card
  aufnr += 1 + (aufnr % 3);
  const billed = sapDay(r[1]!)!;
  const service = /^Service [\d,]+ km$/.test(r[8]!);
  const km = service ? Number(r[8]!.replace(/\D/g, '')) : null;
  const i = Number(r[2]!.slice(-3)) - 100; // customer i → vehicle i
  const opened = addDays(billed, -(1 + ((i + aufnr) % 3)));
  const sap = (d: Date) => `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  // Mileage at the visit: at a service, just past the service's reading; at a repair, somewhere before the next service.
  const mileage = service ? (km! + 40 + ((i * 13) % 180)) : 3000 + ((aufnr * 37) % 9000);
  const net = Number(r[3]);
  const labour = Math.round(net * (service ? 0.35 : 0.45));
  jobRows.push([String(aufnr), service ? 'SM01' : 'SM02', String(300_040_000 + aufnr), r[2]!, r[6]!, sap(opened), sap(billed), String(mileage), service ? `Carry out service ${r[8]!.replace('Service ', '')}` : r[8]!, service ? 'Oil, oil filter, fuel and air filters changed; brakes, belts and fluids checked; road tested' : ['Pads and discs replaced, calipers serviced', 'Clutch kit fitted, hydraulics bled', 'Injectors cleaned and tested, filters changed', 'Gearbox overhauled, seals and bearings replaced', 'Bushes replaced, alignment done', 'System vacuumed, regassed, cabin filter changed', 'Six tyres fitted and balanced, alignment done'][aufnr % 7]!, TECHS[aufnr % TECHS.length]!, `WS-BAY${1 + (aufnr % 4)}`, String(labour), String(Math.round(net - labour)), r[3]!, r[0]!, 'TECO', '1000', 'Isolo Branch']);
}
const JOB_HEADER = ['AUFNR', 'AUART', 'QMNUM', 'KUNUM', 'VHVIN', 'ERDAT', 'IDAT2', 'RECDV', 'KTEXT', 'LTXA1', 'PERNR', 'ARBPL', 'Labour', 'Parts', 'NETWR', 'VBELN', 'STAT', 'WERKS', 'Branch'];
emit('14_SAP_job_card_history_demo.csv', 'jobs', JOB_HEADER, jobRows, [
  { cells: ['489901', 'SM02', '', '0009999999', '', '03.05.2024', '04.05.2024', '12000', 'Unknown customer', '', 'E. Okoro', 'WS-BAY1', '20000', '0', '20000', '', 'TECO', '1000', 'Isolo Branch'], what: 'Customer 0009999999 is not in EJO, and no vehicle to find the owner by', expect: 'rejected', by: 'database', says: 'The customer was not found. Import the customers file first (and the vehicles file, when the job names only the vehicle), or check the customer number.' },
  { cells: ['489902', 'SM01', '', kunnr(3), vin(3), '10.05.2024', '08.05.2024', '20100', 'Carry out service 20,000 km', '', 'B. Musa', 'WS-BAY2', '30000', '45000', '75000', '', 'TECO', '1000', 'Isolo Branch'], what: 'Completed two days before it was opened', expect: 'rejected', by: 'check', says: 'Completed on 2024-05-08 is before it was opened on 2024-05-10.' },
  { cells: ['', 'SM02', '', kunnr(4), vin(4), '11.05.2024', '11.05.2024', '15000', 'No job number', '', 'T. Adesanya', 'WS-BAY3', '10000', '0', '10000', '', 'TECO', '1000', 'Isolo Branch'], what: 'No job number', expect: 'rejected', by: 'check', says: 'Job number is required (the SAP order number, AUFNR, or the old job card number).' },
  { cells: [jobRows[0]![0]!, 'SM01', '', jobRows[0]![3]!, jobRows[0]![4]!, jobRows[0]![5]!, jobRows[0]![6]!, jobRows[0]![7]!, 'Exported twice', '', 'E. Okoro', 'WS-BAY1', '0', '0', '0', '', 'TECO', '1000', 'Isolo Branch'], what: `Job card ${jobRows[0]![0]} a second time in the same file`, expect: 'duplicate', by: 'file', says: 'Same job number as row 2 of the file; only the first is loaded.' },
  { cells: ['489903', 'SM02', '', kunnr(5), vin(5), '12.05.2024', '', '', 'Brakes squeal', '', 'K. Nwachukwu', 'WS-BAY4', '', '', '', '', 'REL', '1000', 'Isolo Branch'], what: 'A job card still open (status REL)', expect: 'rejected', by: 'check', says: 'Status “REL”: a job still open belongs in the open job cards file, not in history.' },
  { cells: ['489904', 'SM01', '', kunnr(6), vin(6), '13.05.2024', '14.05.2024', '30200', 'Carry out service 30,000 km', '', 'S. Lawal', 'WS-BAY1', '30000', '50000', '80000', '', 'TECO', '1100', 'Afprint Assembly Plant'], what: 'A job card of another branch in this branch’s file', expect: 'rejected', by: 'database', says: 'This row is for the branch “Afprint Assembly Plant”, but this import loads into Isolo Branch. Import it into its own branch.' },
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

// ── 15: the job cards still open on the cut-over day (become live EJO job cards) ───
// Eight vehicles from 02 are in the workshop when EJO takes over, at every stage. Opened in the last fortnight before a
// fixed cut-over day; SAP statuses as the order list shows them; the estimate as approved there; the parts already issued
// from the store (part numbers from 03a where the catalogue has them); deposits taken, with the receipt numbers.
const CUTOVER = new Date(Date.UTC(2026, 10, 2)); // 2 November 2026
const plateOf = (i: number) => `LND ${100 + i} ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(66 + (i % 24))}`;
const sapDate = (d: Date) => `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
const OPEN_JOBS: [number, number, string, string, string, string, string, string, string, string, string, string, string, string][] = [
  // vehicle i, days before cut-over, STAT, complaint, findings, technician, labour, parts, approved, parts issued, paid, method, receipt
  [1, 1, 'CRTD', 'Carry out service', '', '', '', '', '', '', '', '', '', 'Customer waiting for a call with the estimate'],
  [2, 3, 'REL', 'Brakes squeal when stopping; steering pulls left', 'Front pads worn to the metal; left tie rod end loose', 'E. Okoro', '45000', '112200', 'Yes', `${partRow(0)[0]} x1 @${partRow(0)[6]}; ${partRow(12)[0]} x2 @${partRow(12)[6]}`, '60000', 'Bank transfer', 'RCPT-2026-1041', ''],
  [3, 5, 'Awaiting parts', 'Engine warning lamp; loss of power uphill', 'Injector no. 3 failed; injector on order from Isuzu', 'B. Musa', '60000', '144000', 'Yes', '', '100000', 'Bank transfer', 'RCPT-2026-1046', 'Part expected Friday'],
  [4, 2, 'REL', 'Carry out service', 'Service in progress', 'T. Adesanya', '35000', '71100', 'Yes', `${partRow(2)[0]} x1 @${partRow(2)[6]}; ${partRow(3)[0]} x1 @${partRow(3)[6]}; ${partRow(4)[0]} x1 @${partRow(4)[6]}; ${partRow(14)[0]} x8 @${partRow(14)[6]}`, '', '', '', ''],
  [5, 4, 'QC', 'Clutch slipping', 'Clutch kit replaced; hydraulics bled; awaiting road test', 'K. Nwachukwu', '80000', '186000', 'Yes', `${partRow(1)[0]} x1 @${partRow(1)[6]}`, '150000', 'Cash', 'RCPT-2026-1039', ''],
  [6, 6, 'Awaiting customer approval', 'Gearbox noisy in third and fourth', 'Gearbox needs an overhaul: bearings and synchro rings', 'S. Lawal', '120000', '310000', 'No', '', '', '', '', 'Estimate sent 29 Oct; customer to confirm'],
  [7, 8, 'TECO', 'Carry out service; replace wiper blades', 'Service done; wiper blades fitted', 'E. Okoro', '30000', '41000', 'Yes', `${partRow(2)[0]} x1 @${partRow(2)[6]}; Wiper blade set x1 @9500`, '71000', 'Bank transfer', 'RCPT-2026-1033', ''],
  [8, 9, 'Ready for collection', 'A/C not cooling', 'System recharged; cabin filter changed; leak test passed', 'B. Musa', '25000', '38000', 'Yes', `Cabin filter x1 @8500`, '63000', 'Cash', 'RCPT-2026-1030', 'Customer told; collecting Monday'],
];
const OPEN_HEADER = ['AUFNR', 'KUNUM', 'VHVIN', 'LICENSE_NUM', 'ERDAT', 'STAT', 'RECDV', 'KTEXT', 'LTXA1', 'Technician', 'Supervisor', 'Labour', 'Parts', 'Estimate approved', 'Parts issued', 'Paid', 'Payment method', 'Receipt', 'Paid on', 'Notes', 'Branch'];
const openRows = OPEN_JOBS.map(([i, days, stat, complaint, findings, tech, labour, parts, approved, issued, paid, method, receipt, notes], k) => {
  const opened = addDays(CUTOVER, -days);
  const mileage = (lastServiceKm.get(vin(i)) ?? 5000) + 1500 + (i % 5) * 700; // the vehicles file's mileage: it came in at that reading
  return [String(483_200 + k * 3 + (i % 2)), kunnr(i), vin(i), plateOf(i), sapDate(opened), stat, String(mileage), complaint, findings, tech, '', labour, parts, approved, issued, paid, method, receipt, paid ? sapDate(opened) : '', notes, 'Isolo Branch'];
});
emit('15_SAP_open_job_cards_demo.csv', 'openJobs', OPEN_HEADER, openRows, [
  { cells: ['483290', kunnr(9), vin(9), plateOf(9), sapDate(addDays(CUTOVER, -20)), 'CLSD', '', 'Closed last month', 'Done and collected', '', '', '', '', '', '', '', '', '', '', '', 'Isolo Branch'], what: 'A job card already closed (CLSD): it belongs in the history file', expect: 'rejected', by: 'check', says: 'Stage “CLSD”: a closed, checked-out or cancelled job card belongs in the job card history file, not here.' },
  { cells: ['483291', kunnr(10), vin(10), plateOf(10), sapDate(addDays(CUTOVER, -2)), 'Somewhere', '', 'Unknown stage', '', '', '', '', '', '', '', '', '', '', '', '', 'Isolo Branch'], what: 'A stage EJO does not know', expect: 'rejected', by: 'check', says: '“Somewhere” is not a stage EJO knows: use Checked in, In progress, Awaiting parts, Quality check, Awaiting customer approval, Completed or Ready for collection (or SAP’s CRTD, REL, TECO).' },
  { cells: ['483292', kunnr(11), '', '', sapDate(addDays(CUTOVER, -2)), 'REL', '', 'No vehicle', '', '', '', '', '', '', '', '', '', '', '', '', 'Isolo Branch'], what: 'No chassis number or plate', expect: 'rejected', by: 'check', says: 'Which vehicle is it? Give the chassis number (VIN) or the plate: an open job card is on a vehicle that is in EJO.' },
  { cells: ['483293', kunnr(2), vin(2), plateOf(2), sapDate(addDays(CUTOVER, -1)), 'CRTD', '', 'A second job card on the same vehicle', '', '', '', '', '', '', '', '', '', '', '', '', 'Isolo Branch'], what: `Vehicle ${vin(2)} a second time (row 3 has it): one open job card per vehicle`, expect: 'duplicate', by: 'file', says: 'Same chassis number as row 3 of the file; only the first is loaded.' },
  { cells: ['483294', kunnr(12), vin(12), plateOf(12), '15.03.2027', 'REL', '', 'Opened in the future', '', '', '', '', '', '', '', '', '', '', '', '', 'Isolo Branch'], what: 'Opened on a date in the future', expect: 'rejected', by: 'check', says: 'The opening date 2027-03-15 is in the future.' },
  { cells: ['483295', '0009999999', 'JAANLR85EL7999999', 'XYZ 999 ZZ', sapDate(addDays(CUTOVER, -2)), 'REL', '', 'Vehicle not in EJO', '', '', '', '', '', '', '', '', '', '', '', '', 'Isolo Branch'], what: 'A vehicle EJO does not have', expect: 'rejected', by: 'database', says: 'The vehicle is not in EJO. Import the vehicles file first (the open job card needs the vehicle it is on), or check the chassis number or plate.' },
]);

// ── 18: the services open on the cut-over day, and the bookings already in the diary ───
// Eight customers from 01 booked their routine service for the days after the cut-over (vehicles 13–20, between 08:00 and
// 15:30); three more vehicles are already in the workshop for a service (checked in, in service, ready for collection).
const SVC_HEADER = ['Booking number', 'KUNUM', 'VHVIN', 'LICENSE_NUM', 'Stage', 'Booked for', 'Time', 'Checked in on', 'RECDV', 'Work requested', 'Supervisor', 'Technician', 'Notes', 'Branch'];
const TIMES = ['08:00', '08:30', '09:30', '10:00', '11:30', '13:00', '14:00', '15:30'];
const svcRows: string[][] = [];
for (let k = 0; k < 8; k += 1) {
  const i = 13 + k;
  const day = addDays(CUTOVER, 1 + k + (k >= 4 ? 2 : 0)); // the weekend skipped after the fourth
  const km = (lastServiceKm.get(vin(i)) ?? 5000) + 10_000;
  svcRows.push([`BK-2026-${String(600 + k).padStart(4, '0')}`, kunnr(i), vin(i), plateOf(i), 'Booked', sapDate(day), TIMES[k]!, '', '', `Service ${km.toLocaleString('en-US')} km${k % 3 === 0 ? '; check the brakes' : ''}`, '', '', k === 2 ? 'Customer will wait; prefers an early slot' : '', 'Isolo Branch']);
}
([[21, 'Checked in', 1, 'Service; wheel alignment'], [22, 'In service', 2, 'Service; replace the wiper blades'], [23, 'Ready for collection', 3, 'Service; A/C filter']] as const).forEach(([i, stage, days, work], k) => {
  svcRows.push([`SV-OLD-${String(7100 + k)}`, kunnr(i), vin(i), plateOf(i), stage, '', '', sapDate(addDays(CUTOVER, -days)), String((lastServiceKm.get(vin(i)) ?? 5000) + 9_800), work, '', '', '', 'Isolo Branch']);
});
emit('18_SAP_open_services_and_bookings_demo.csv', 'openServices', SVC_HEADER, svcRows, [
  { cells: ['', kunnr(24), vin(24), plateOf(24), 'Booked', sapDate(addDays(CUTOVER, 3)), '10:00', '', '', 'Service', '', '', '', 'Isolo Branch'], what: 'No booking number', expect: 'rejected', by: 'check', says: 'Booking or service number is required (SAP AUFNR or QMNUM, or the diary’s booking reference).' },
  { cells: ['BK-2026-0690', kunnr(25), vin(25), plateOf(25), 'Collected', '', '', sapDate(addDays(CUTOVER, -9)), '', 'Service', '', '', '', 'Isolo Branch'], what: 'A service already collected: it is history', expect: 'rejected', by: 'check', says: 'Stage “Collected”: a closed, collected or cancelled service is history (load it with the job card history), not an open one.' },
  { cells: ['BK-2026-0691', kunnr(26), vin(26), plateOf(26), 'Booked', '', '', '', '', 'Service', '', '', '', 'Isolo Branch'], what: 'A booking without its day', expect: 'rejected', by: 'check', says: 'A booking needs its day (Booked for): when is the customer expected?' },
  { cells: ['BK-2026-0692', '0009999999', 'JAANLR85EL7999999', 'XYZ 999 ZZ', 'Booked', sapDate(addDays(CUTOVER, 4)), '09:00', '', '', 'Service', '', '', '', 'Isolo Branch'], what: 'A vehicle EJO does not have', expect: 'rejected', by: 'database', says: 'The vehicle is not in EJO. Import the vehicles file first (a service or a booking is for a vehicle in EJO), or check the chassis number or plate.' },
  { cells: ['BK-2026-0693', kunnr(13), vin(13), plateOf(13), 'Booked', sapDate(addDays(CUTOVER, 12)), '09:00', '', '', 'A second booking for the same vehicle', '', '', '', 'Isolo Branch'], what: `Vehicle ${vin(13)} a second time (row 2 has it): one open visit per vehicle`, expect: 'duplicate', by: 'file', says: 'Same chassis number as row 2 of the file; only the first is loaded.' },
  { cells: ['SV-OLD-7199', kunnr(27), vin(27), plateOf(27), 'In service', '', '', '15.03.2027', '', 'Service', '', '', '', 'Isolo Branch'], what: 'In the workshop since a day in the future', expect: 'rejected', by: 'check', says: 'Checked in on 2027-03-15, which is in the future: a vehicle in the workshop came in already.' },
]);

// ── 16: the warranties sold before EJO (become EJO warranties under the demo policies) ───
// Fourteen vehicles from 02, each delivered a few days after its PDI with 25 km on the clock, under the Isuzu or Soueast
// policy of the workshop demo (DEMO-ISZ-3Y, DEMO-SEM-5Y): most name the policy, two leave it to be found from the months,
// km and provider. Most of these vehicles were sold years ago, so their warranty has ended: kept for its history. Vehicle 25
// (sold in 2024) is still covered. Six parts fitted before EJO and still covered: four batteries (part 18 of 03a, with their
// serials) under DEMO-BAT-12M, two sets of brake pads (part 1 of 03a) under DEMO-PAD-6M. One warranty suspended, with its reason.
const WTY_HEADER = ['MGANR', 'Covers', 'VHVIN', 'LICENSE_NUM', 'KUNNR', 'Policy', 'Provider', 'Months', 'Km', 'GWLDT', 'GWLEN', 'Start km', 'MATNR', 'SERNR', 'Evidence', 'Status', 'Notes'];
const wtyNumber = (i: number) => `W-${buildOf(i).pdi.getUTCFullYear()}-${String(400 + i).padStart(4, '0')}`;
const deliveredOf = (i: number) => addDays(buildOf(i).pdi, 5 + (i % 3));
const soueast = (i: number) => MODELS[i % MODELS.length]![0] === 'Soueast';
const WTY_VEHICLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 25, 30];
const wtyRows: string[][] = [];
for (const i of WTY_VEHICLES) {
  const named = i !== 3 && i !== 9; // 3 and 9: no policy named, found from the months, km and provider
  const [code, months, km, provider] = soueast(i) ? ['DEMO-SEM-5Y', '60', '150000', 'Soueast Motor Co., Ltd (demo)'] : ['DEMO-ISZ-3Y', '36', '100000', 'Isuzu Motors Ltd (demo)'];
  wtyRows.push([wtyNumber(i), 'Vehicle', vin(i), plateOf(i), kunnr(i), named ? code : '', named ? '' : provider, named ? '' : months, named ? '' : km, sapDate(deliveredOf(i)), '', '25', '', '', `Invoice ${90100000 + i} of ${sapDate(deliveredOf(i))}`, i === 6 ? 'Suspended' : 'Active', i === 6 ? 'Engine tampered with outside an authorised workshop; under investigation' : '']);
}
const battery = partRow(17);
const pads = partRow(0);
/** Parts fitted before EJO: [warranty number, vehicle, part, policy, days before the cut-over, serial]. */
const FITTED: [string, number, string[], string, number, string][] = [
  ['B-2026-0001', 2, battery, 'DEMO-BAT-12M', 210, 'EXB-2026-7101'], ['B-2026-0002', 5, battery, 'DEMO-BAT-12M', 160, 'EXB-2026-7102'],
  ['B-2026-0003', 7, battery, 'DEMO-BAT-12M', 300, 'EXB-2025-6950'], ['B-2026-0004', 11, battery, 'DEMO-BAT-12M', 95, 'EXB-2026-7188'],
  ['P-2026-0001', 1, pads, 'DEMO-PAD-6M', 70, ''], ['P-2026-0002', 8, pads, 'DEMO-PAD-6M', 45, ''],
];
for (const [no, i, part, code, days, serial] of FITTED) {
  const fitted = addDays(CUTOVER, -days);
  wtyRows.push([no, 'Part', vin(i), plateOf(i), kunnr(i), code, '', '', '', sapDate(fitted), '', '', part[0]!, serial, `Job card ${483000 + days} of ${sapDate(fitted)}`, 'Active', '']);
}
emit('16_SAP_warranties_demo.csv', 'warranties', WTY_HEADER, wtyRows, [
  { cells: ['', 'Vehicle', vin(13), plateOf(13), kunnr(13), 'DEMO-ISZ-3Y', '', '', '', '04.05.2025', '', '25', '', '', 'Invoice 90100013', 'Active', ''], what: 'No warranty number', expect: 'rejected', by: 'check', says: 'Warranty number is required (SAP MGANR or the old system’s warranty or certificate number).' },
  { cells: ['W-2027-0901', 'Vehicle', vin(14), plateOf(14), kunnr(14), 'DEMO-ISZ-3Y', '', '', '', '15.03.2027', '', '25', '', '', 'Invoice 90100014', 'Active', ''], what: 'A warranty that starts in the future', expect: 'rejected', by: 'check', says: 'The start date 2027-03-15 is in the future: a warranty starts on the day the vehicle or part was delivered.' },
  { cells: ['W-2025-0902', 'Vehicle', vin(15), plateOf(15), kunnr(15), 'DEMO-XYZ-9Y', '', '', '', '04.05.2025', '', '25', '', '', 'Invoice 90100015', 'Active', ''], what: 'A policy EJO does not have', expect: 'rejected', by: 'database', says: 'There is no warranty policy “DEMO-XYZ-9Y” in EJO. Create it under Warranty → Policies (its code or name), or give the months and km so it can be found.' },
  { cells: ['W-2025-0903', 'Vehicle', 'JAANLR85EL7999999', 'XYZ 999 ZZ', '0009999999', 'DEMO-ISZ-3Y', '', '', '', '04.05.2025', '', '25', '', '', 'Invoice 90100016', 'Active', ''], what: 'A vehicle EJO does not have', expect: 'rejected', by: 'database', says: 'The vehicle is not in EJO. Import the vehicles file first (a vehicle warranty needs the vehicle it covers), or check the chassis number or plate.' },
  { cells: [wtyNumber(2), 'Vehicle', vin(16), plateOf(16), kunnr(16), 'DEMO-ISZ-3Y', '', '', '', '04.05.2025', '', '25', '', '', 'Invoice 90100017', 'Active', ''], what: `Warranty ${wtyNumber(2)} a second time (row 3 has it)`, expect: 'duplicate', by: 'file', says: 'Same warranty number as row 3 of the file; only the first is loaded.' },
  { cells: ['W-2025-0904', 'Vehicle', vin(17), plateOf(17), kunnr(17), 'DEMO-ISZ-3Y', '', '', '', '04.05.2025', '', '25', '', '', 'Invoice 90100018', 'Pending?', ''], what: 'A status EJO does not know', expect: 'rejected', by: 'check', says: '“Pending?” is not a warranty status EJO knows: use Active, Suspended, Void or Transferred.' },
]);

// ── 17: the warranty claims still open on the cut-over day (become live EJO claims) ───
// Eight claims on the warranties of 16 still in force, one at every open stage: a draft, one with the Warranty HOD, one
// with the Manager, one approved to submit, two with the provider (one with its failed part sent), one accepted (the failed
// battery received by the provider) and one rejected.
const CLAIM_HEADER = ['CLMNO', 'MGANR', 'Stage', 'REPDA', 'Odometer', 'Complaint', 'Cause', 'Correction', 'Causal part', 'Causal part number', 'Labour', 'Parts', 'Other', 'Logistics', 'Accepted amount', 'Provider reference', 'Submitted on', 'Decided on', 'Remedy', 'Part return', 'Notes'];
const vehicleWty = wtyNumber(25);
const CLAIMS: [string, number, string, number, string, string, string, string, string, string, string, string, string, string, string][] = [
  // warranty, vehicle, stage, days before cut-over, complaint, cause, correction, causal part, part number, labour, parts, accepted, provider ref, part return, notes
  ['B-2026-0001', 2, 'Draft', 3, 'Battery will not hold a charge overnight', '', '', '', '', '', '', '', '', '', 'Waiting for the load test'],
  ['P-2026-0001', 1, 'With the Warranty HOD', 6, 'Brakes squeal; pads cracked across the face', 'Friction material separated from the backing plate', 'Pads replaced (front axle)', pads[1]!, pads[0]!, '15000', pads[6]!, '', '', 'Yes', ''],
  [vehicleWty, 25, 'With the Manager', 9, 'Fuel gauge reads empty when the tank is full', 'Fuel sender unit open circuit', 'Fuel sender unit replaced', 'Fuel sender unit', '8-98100026-6', '18000', '42000', '', '', '', ''],
  [vehicleWty, 25, 'Approved to submit', 12, 'Water pump leaking coolant', 'Water pump seal failed', 'Water pump replaced; coolant refilled', 'Water pump assembly', partRow(6)[0]!, '35000', partRow(6)[6]!, '', '', 'Yes', ''],
  ['B-2026-0002', 5, 'Submitted', 18, 'Vehicle will not start in the morning', 'Battery cell short-circuited (load test failed)', 'Battery replaced', battery[1]!, battery[0]!, '5000', battery[6]!, '', 'OAE-WC-2026-031', 'Sent', ''],
  ['P-2026-0002', 8, 'Submitted', 15, 'Brake pedal pulsates', 'Pad compound glazed within 2,000 km', 'Pads replaced; discs skimmed', pads[1]!, pads[0]!, '15000', pads[6]!, '', 'IBF-CLM-0711', '', ''],
  ['B-2026-0003', 7, 'Accepted', 30, 'Battery swollen', 'Battery case deformed by an internal fault', 'Battery replaced', battery[1]!, battery[0]!, '5000', battery[6]!, battery[6]!, 'OAE-WC-2026-024', 'Received', 'Replacement battery to follow from the supplier'],
  ['B-2026-0004', 11, 'Rejected', 26, 'Battery flat after a week parked', 'Deep discharge from a faulty alarm drawing current', 'Alarm wiring repaired; battery recharged', battery[1]!, battery[0]!, '8000', '0', '', 'OAE-WC-2026-027', '', 'Rejected: deep discharge from a fault elsewhere in the vehicle is excluded'],
];
const claimRows = CLAIMS.map(([wty, i, stage, days, complaint, cause, correction, part, partNo, labour, parts, accepted, ref, ret, notes], k) => {
  const failed = addDays(CUTOVER, -days);
  const withProvider = ['Submitted', 'Accepted', 'Rejected'].includes(stage);
  return [`C-2026-${String(180 + k).padStart(4, '0')}`, wty, stage, sapDate(failed), String((lastServiceKm.get(vin(i)) ?? 5000) + 900), complaint, cause, correction, part, partNo, labour, parts, '', '', accepted, ref, withProvider ? sapDate(addDays(failed, 2)) : '', stage === 'Accepted' || stage === 'Rejected' ? sapDate(addDays(failed, 9)) : '', '', ret, notes];
});
emit('17_SAP_open_claims_demo.csv', 'claims', CLAIM_HEADER, claimRows, [
  { cells: ['C-2026-0290', vehicleWty, 'Settled', sapDate(addDays(CUTOVER, -60)), '', 'Wiper motor stopped', 'Wiper motor failed', 'Wiper motor replaced', 'Wiper motor', '', '12000', '38000', '', '', '50000', 'ISZ-WTY-53001', sapDate(addDays(CUTOVER, -58)), sapDate(addDays(CUTOVER, -50)), '', '', ''], what: 'A settled claim: it is history', expect: 'rejected', by: 'check', says: 'Stage “Settled”: a settled or cancelled claim is history and stays in the old system; bring in the claims still open.' },
  { cells: ['C-2026-0291', 'W-1999-0001', 'Draft', sapDate(addDays(CUTOVER, -4)), '', 'Door lock jammed', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''], what: 'A warranty EJO does not have', expect: 'rejected', by: 'database', says: 'Warranty W-1999-0001 is not in EJO. Import the warranties file first (the claim is on a warranty), or check the number.' },
  { cells: ['C-2026-0292', vehicleWty, 'Draft', sapDate(addDays(CUTOVER, -4)), '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''], what: 'No complaint', expect: 'rejected', by: 'check', says: 'The complaint is required: what the customer reported.' },
  { cells: ['C-2026-0293', vehicleWty, 'Partially accepted', sapDate(addDays(CUTOVER, -20)), '', 'Turbo whistle under load', 'Turbo bearing worn', 'Turbo replaced', 'Turbocharger', '', '40000', '310000', '', '', '', 'ISZ-WTY-55050', sapDate(addDays(CUTOVER, -18)), sapDate(addDays(CUTOVER, -10)), '', '', ''], what: 'Partially accepted with no accepted amount', expect: 'rejected', by: 'check', says: 'Partially accepted: give the amount the provider accepted.' },
  { cells: ['C-2026-0181', 'P-2026-0002', 'Draft', sapDate(addDays(CUTOVER, -2)), '', 'The same claim number again', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''], what: 'Claim C-2026-0181 a second time (row 3 has it)', expect: 'duplicate', by: 'file', says: 'Same claim number as row 3 of the file; only the first is loaded.' },
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

// ── 09: a supplier's packing list, pasted into Assembly plant → Record a shipment (not a Data Exchange import) ──
// One kit per line: VIN or frame number, engine number, model, lot, cases. New VINs (not in 02): they arrive as kits.
const KIT_HEADER = ['VIN', 'Engine number', 'Model', 'Lot', 'Cases'];
const kitVin = (n: number) => `JAANLR85EL72${String(10000 + n).slice(-5)}`;
const kitLines: string[][] = [
  ...Array.from({ length: 8 }, (_, i) => [kitVin(i + 1), `4HK1-${String(611000 + i)}`, ['NQR', 'NQR', 'NQR', 'NPR', 'NPR', 'QMR', 'QMR', 'QLR'][i]!, `LOT-2611-${pad(i + 1)}`, String([14, 14, 14, 12, 12, 11, 11, 11][i])]),
  ...Array.from({ length: 4 }, (_, i) => [`LVVDB21B8RD0${String(10100 + i)}`, `SQRE4T15C-${String(80100 + i)}`, 'S07', `SE-2611-${pad(i + 1)}`, '3']),
];
const kitMistakes: Mistake[] = [
  { cells: ['BRAKE PAD SET', '', 'NQR', 'LOT-2611-90', '14'], what: 'A part name where the VIN should be', expect: 'rejected', by: 'check', says: '“BRAKE PAD SET” is not a VIN or frame number.' },
  { cells: [kitVin(1), '4HK1-611000', 'NQR', 'LOT-2611-01', '14'], what: `VIN ${kitVin(1)} twice`, expect: 'duplicate', by: 'file', says: `${kitVin(1)} is already on line 2.` },
  { cells: [kitVin(20), '4JJ1-700001', 'D-MAX', 'LOT-2611-91', '6'], what: 'A model the plant does not build (D-MAX)', expect: 'rejected', by: 'check', says: 'choose the model (NQR, NPR, QLR, QMR, S07).' },
  { cells: [kitVin(21), '4HK1-611099', 'NQR', 'LOT-2611-92', '900'], what: '900 cases for one kit', expect: 'rejected', by: 'check', says: '900 cases is not a likely number for one kit.' },
];
{
  const file = '09_kit_packing_list_demo.csv';
  // Plain comma-separated, no quotes: the shipment form reads a pasted packing list line by line.
  const text = (rows: string[][]) => `${[KIT_HEADER, ...rows].map((r) => r.join(',')).join('\n')}\n`;
  writeFileSync(join(CORRECT, file), text(kitLines));
  writeFileSync(join(MISTAKES, file), text([...kitLines, ...kitMistakes.map((m) => m.cells.map(String))]));
  kitMistakes.forEach((m, i) => planted.push({ ...m, file, entity: 'kits', row: kitLines.length + 2 + i, says: `Line ${kitLines.length + 2 + i}: ${m.says}` }));
}

// ── 10–13: the plant's records (the same six weeks `npm run demo:reset` loads, as files) ──
// Written from the plan as of a fixed Friday afternoon so the files are the same every run. These are the layouts the plant
// records import (vehicles, shipments and kits, open kit issues) reads and the exports write; correct/ only until that import lands.
{
  const plan = planPlantDemo(new Date('2026-10-30T15:00:00Z'));
  const PLANT = 'Afprint Assembly Plant';
  const who = (key: string | null) => (key ? DEMO_PEOPLE.find((p) => p.key === key)?.employeeId ?? '' : '');
  const when = (d: Date | null) => (d ? new Date(d.getTime() + 3_600_000).toISOString().slice(0, 16).replace('T', ' ') : ''); // Lagos clock (UTC+1)
  const shipHeader = ['Branch', 'Shipment ref', 'Supplier', 'Origin', 'Bill of lading', 'Vessel', 'Containers', 'Arrived', 'EBELN', 'VBELN', 'Notes'];
  writeFileSync(join(CORRECT, '10_plant_shipments_demo.csv'), toCsv(shipHeader, plan.shipments.map((sh) => [PLANT, sh.key.toUpperCase(), sh.supplier, sh.origin, sh.billOfLading, sh.vessel, sh.containers.join('; '), when(sh.arrivedAt), sh.sapPurchaseOrder, sh.sapInboundDelivery, sh.notes])));
  const kitHeader = ['Branch', 'Shipment ref', 'VIN', 'Engine number', 'Model', 'Lot', 'Kit type', 'Cases expected', 'Cases received', 'Status', 'Inspector', 'Started', 'Submitted', 'Decided by', 'Decided', 'Usage decision', 'Released with shortages', 'PRUEFLOS', 'MBLNR', 'Decision note'];
  writeFileSync(join(CORRECT, '11_plant_kits_demo.csv'), toCsv(kitHeader, plan.shipments.flatMap((sh) => sh.kits.map((k) => [PLANT, sh.key.toUpperCase(), k.vin, k.engineNumber, k.modelCode, k.lotNumber, k.kitType, String(k.casesExpected), k.casesReceived === null ? '' : String(k.casesReceived), k.status, who(k.inspector), when(k.startedAt), when(k.submittedAt), who(k.decidedBy), when(k.decidedAt), k.sapUsageDecision ?? '', k.releasedWithShortages ? 'Yes' : 'No', k.sapInspectionLot, k.sapMaterialDocument, k.decisionNote ?? '']))));
  const issueHeader = ['Branch', 'Kit VIN', 'Kind', 'Part number', 'Description', 'Case', 'Quantity', 'Stops the line', 'Status', 'Claim reference', 'Resolution', 'Raised by', 'Raised'];
  writeFileSync(join(CORRECT, '12_plant_kit_issues_demo.csv'), toCsv(issueHeader, plan.shipments.flatMap((sh) => sh.kits.flatMap((k) => k.issues.map((i) => [PLANT, k.vin, i.kind, i.partNumber ?? '', i.description, i.caseNumber ?? '', String(i.quantity), i.stopsLine ? 'Yes' : 'No', i.status, i.claimReference ?? '', i.resolution ?? '', who(i.raisedBy), when(i.raisedAt)])))));
  const vehHeader = ['Branch', 'VIN', 'Make', 'Model', 'Model name', 'Engine number', 'Colour', 'Model year', 'Stage', 'Current station', 'Line started', 'Gate passed', 'WERKS', 'MATNR', 'AUFNR', 'EQUNR'];
  writeFileSync(join(CORRECT, '13_plant_vehicles_demo.csv'), toCsv(vehHeader, plan.vehicles.map((v) => [PLANT, v.vin, v.make, v.modelCode, v.modelName, v.engineNumber, v.colour, String(v.modelYear), v.stage, v.currentStation ?? '', when(v.lineStartedAt), when(v.gatePassedAt), '1100', v.sapMaterial, v.sapProductionOrder, v.sapEquipment ?? ''])));
}

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
6a. \`14_SAP_job_card_history_demo.csv\` — Job card history (SAP service orders): one job card per invoice, into the workshop branch (Isolo Branch); the services among them start each vehicle’s next-service clock
6b. \`15_SAP_open_job_cards_demo.csv\` — Open job cards at the cut-over (into Isolo Branch): eight vehicles from 02 in the workshop at every stage, with estimates, parts issued and deposits; they become live EJO job cards
6b2. \`18_SAP_open_services_and_bookings_demo.csv\` — Open services and bookings at the cut-over (into Isolo Branch): eight bookings for the days after (vehicles 13–20, with their times) and three services already in the workshop; a booking waits for its customer, a service carries on at its stage
6c. \`16_SAP_warranties_demo.csv\` — Warranties sold before EJO (the workshop demo’s policies must be in EJO): fourteen vehicles from 02 under the Isuzu and Soueast policies (two found from their months and km; most have ended and are kept for their history), four batteries and two sets of brake pads fitted before EJO, one suspended warranty; they become EJO warranties, active from the day they started
6d. \`17_SAP_open_claims_demo.csv\` — Open warranty claims at the cut-over: eight claims on the warranties of 16 still in force, one at every open stage, from a draft to one accepted and one rejected; they become live EJO claims
7. \`07_PDI_register_demo.xlsx\` and \`08_production_QC_register_demo.csv\` — Registers
8. \`09_kit_packing_list_demo.csv\` — not an import: open it, copy the lines and paste them into **Assembly plant → Record a shipment** (12 kits: 8 Isuzu, 4 Soueast S07)
9. \`10_plant_shipments_demo.csv\`, \`11_plant_kits_demo.csv\`, \`12_plant_kit_issues_demo.csv\`, \`13_plant_vehicles_demo.csv\` — the plant's six demo weeks as files (the same records \`npm run demo:reset\` loads straight into the plant, as of a fixed Friday). They are the layouts the plant records import reads; until that import lands, load the demo with the reset instead.

Real events are part of the story and load as they are: a PDI that failed and
was re-inspected, a QC rework, credit notes (G2). The same files with planted
mistakes are in [\`../with-mistakes/\`](../with-mistakes/).
`);
writeFileSync(join(ROOT_OUT, 'README.md'), `# Demo files

Invented data only (no real customer), the same on every run of
\`npx tsx apps/portal/scripts/demo-files.ts\`. The plant files (10–13) are the same six
weeks \`npm run demo:reset\` loads straight into the plant (DATA_MIGRATION.md §7b).

| Folder | Use it to |
| --- | --- |
| [\`correct/\`](correct/) | load the demo data cleanly — every row is accepted |
| [\`with-mistakes/\`](with-mistakes/) | test the import's check — the same data plus ${planted.length} planted mistakes, each listed with its row and what EJO says |

The walkthrough ([\`docs/DEMO_WALKTHROUGH.md\`](../DEMO_WALKTHROUGH.md)) uses
\`with-mistakes/\` where it shows the check catching problems.
`);
console.log(`Demo files written to ${CORRECT} and ${MISTAKES} (${planted.length} planted mistakes)`);
