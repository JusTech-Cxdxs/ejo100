/**
 * Demo files for showing Data Exchange end to end (docs/DEMO_WALKTHROUGH.md):
 * an SAP-style customers export and a vehicles workbook, with deliberate
 * mistakes for the check to catch. Deterministic (the same files every run),
 * invented names only — no real customer data.
 *
 *   npx tsx apps/portal/scripts/demo-files.ts        → docs/demo/
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeXlsx } from '../lib/data-exchange/xlsx-writer';
import { toCsv } from '../lib/hq-core';

const OUT = join(__dirname, '..', '..', '..', 'docs', 'demo');
mkdirSync(OUT, { recursive: true });

const FIRST = ['Adaeze', 'Babatunde', 'Chinedu', 'Damilola', 'Emeka', 'Funke', 'Gbenga', 'Halima', 'Ifeanyi', 'Jumoke', 'Kelechi', 'Lola', 'Musa', 'Ngozi', 'Olumide', 'Patience', 'Rotimi', 'Sadiq', 'Temitope', 'Uche'];
const LAST = ['Okafor', 'Adeyemi', 'Bello', 'Eze', 'Ibrahim', 'Nwosu', 'Ogunleye', 'Abubakar', 'Okonkwo', 'Balogun'];
const STREETS = ['Plot 12, Isolo Industrial Estate', '14 Oshodi-Apapa Expressway', '7 Adeniyi Jones Avenue', '21 Allen Avenue', '3 Ligali Ayorinde Street', '9 Ikorodu Road', '45 Herbert Macaulay Way', '2 Ago Palace Way'];
const CITIES = ['Isolo', 'Ikeja', 'Victoria Island', 'Yaba', 'Surulere', 'Apapa', 'Lekki', 'Oshodi'];
const FLEETS = ['Dangana Haulage', 'Lagoon Logistics', 'Eko Cold Chain', 'Unity Couriers', 'Harbour Freight'];

const kunnr = (n: number) => `000${1000100 + n}`; // SAP keeps leading zeros
const phone = (n: number) => `080${3 + (n % 5)} ${String(200 + n).padStart(3, '0')} ${String(4000 + n * 7).slice(-4)}`;

// ── Customers (SAP customer master layout) ─────────────────────────────
const custHeader = ['KUNNR', 'NAME1', 'NAME2', 'KTOKD', 'SMTP_ADDR', 'TELF1', 'TELF2', 'STRAS', 'ORT01', 'REGIO', 'STCD1', 'ERDAT'];
const cust: string[][] = [];
for (let i = 1; i <= 30; i += 1) {
  const fleet = i % 6 === 0 ? FLEETS[(i / 6 - 1) % FLEETS.length]! : null;
  const name = fleet ?? `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`;
  const email = i % 4 === 0 ? '' : `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.ng`; // a quarter have no email, as in SAP
  cust.push([kunnr(i), name, fleet ? 'Ltd' : '', fleet ? 'Company' : 'Individual', email, phone(i), '', STREETS[i % STREETS.length]!, CITIES[i % CITIES.length]!, 'LA', fleet ? `${10000000 + i}-0001` : '', `20${String(12 + (i % 12)).padStart(2, '0')}-0${1 + (i % 9)}-1${i % 9}`]);
}
// Deliberate mistakes for the check: a missing name, a broken email, the same customer number twice.
cust.push([kunnr(31), '', '', 'Individual', '', phone(31), '', 'Ikeja', 'Ikeja', 'LA', '', '2020-01-10']);
cust.push([kunnr(32), 'Yetunde Afolabi', '', 'Individual', 'yetunde.afolabi@@example', phone(32), '', '5 Opebi Road', 'Ikeja', 'LA', '', '2021-06-02']);
cust.push([kunnr(5), 'Duplicate Of Row Six', '', 'Individual', '', '', '', '', '', '', '', '']);
writeFileSync(join(OUT, '01_SAP_customers_demo.csv'), toCsv(custHeader, cust));

// ── Vehicles (Excel workbook) ──────────────────────────────────────────
const MODELS: [string, string, string, number][] = [['Isuzu', 'NQR 71', 'Commercial', 2024], ['Isuzu', 'NPR 71', 'Commercial', 2023], ['Isuzu', 'QLR 55', 'Commercial', 2025], ['Isuzu', 'QMR 55', 'Commercial', 2024], ['Soueast', 'S07', 'Passenger', 2025]];
const vin = (n: number) => `JAANLR85EL7${String(100000 + n).slice(-6)}`;
const vehRows: (string | number)[][] = [['Customer number', 'VIN', 'Plate', 'Engine number', 'Make', 'Model', 'Category', 'Year', 'Mileage']];
for (let i = 1; i <= 30; i += 1) {
  const [make, model, cat, year] = MODELS[i % MODELS.length]!;
  vehRows.push([kunnr(i), vin(i), `LND ${100 + i} ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(66 + (i % 24))}`, make === 'Isuzu' ? `4JJ1-${500000 + i}` : `F4J16-${700000 + i}`, make, model, cat, year, 1500 * i]);
}
// Deliberate mistakes: the same VIN twice, a vehicle with no VIN and no plate, an unknown customer.
vehRows.push([kunnr(7), vin(3), '', '', 'Isuzu', 'NPR 71', 'Commercial', 2023, 900]);
vehRows.push([kunnr(8), '', '', '', 'Soueast', 'S07', 'Passenger', 2025, 50]);
vehRows.push(['0009999999', vin(99), 'KJA 999 ZZ', '', 'Isuzu', 'QMR 55', 'Commercial', 2024, 300]);
writeFileSync(join(OUT, '02_vehicles_demo.xlsx'), writeXlsx([{ name: 'Vehicles', header: true, rows: vehRows, widths: [18, 22, 14, 16, 10, 10, 12, 8, 10] }]));

// ── Suppliers (SAP vendor master) ──────────────────────────────────────
const VENDORS: [string, string, string, string][] = [
  ['Isuzu Motors', 'International Operations', 'Tokyo', 'orders.isuzu@example.com'], ['Isuzu East Africa', 'Parts Division', 'Nairobi', 'parts.iea@example.com'],
  ['Soueast Motor', 'Export Department', 'Fuzhou', 'export.soueast@example.com'], ['Bosch Automotive', 'Aftermarket West Africa', 'Lagos', 'aftermarket@example.com'],
  ['Total Energies Lubricants', 'Lagos Depot', 'Apapa', 'lubes@example.com'], ['Michelin Tyres', 'Nigeria Distribution', 'Ikeja', 'tyres@example.com'],
  ['Exide Batteries', 'Lagos Branch', 'Ikeja', 'batteries@example.com'], ['Denso Filters', 'Distributor Lagos', 'Oshodi', 'filters@example.com'],
  ['Lagos Fasteners', '', 'Isolo', 'sales@lagosfasteners.example.ng'], ['Eko Paints & Coatings', '', 'Ilupeju', 'orders@ekopaints.example.ng'],
];
writeFileSync(join(OUT, '05_SAP_suppliers_demo.csv'), toCsv(['LIFNR', 'NAME1', 'NAME2', 'ORT01', 'SMTP_ADDR', 'TELF1'], VENDORS.map(([n1, n2, city, mail], i) => [`00003000${String(41 + i).padStart(2, '0')}`, n1, n2, city, mail, `+234 1 270 ${String(1000 + i * 37).slice(-4)}`])));

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
writeParts(DEMO_PARTS, join(OUT, '03_SAP_parts_50k.csv'));
// A small file for a quick first try.
writeParts(200, join(OUT, '03a_SAP_parts_200.csv'));

// ── Opening stock (SAP stock with valuation) ───────────────────────────
const stock: string[][] = [];
for (let i = 0; i < 2_000; i += 1) {
  const p = partRow(i * 7);
  const qty = p[3] === 'L' ? 208 * (1 + (i % 4)) : 2 + (i % 25);
  const unitCost = Math.round(Number(p[6]) * 0.72);
  const batched = p[4] === 'X';
  stock.push([p[0]!, String(qty), p[3]!, (qty * unitCost).toFixed(2), String(unitCost), '1', batched ? `B2026${String(i).padStart(5, '0')}` : '', i % 3 === 0 ? '0002' : '0001']);
}
// Deliberate mistakes for the check: negative stock, a part that is not in the catalogue, no cost, a batch part without its batch.
stock.push([partRow(5)[0]!, '3-', 'ST', '0', '', '1', '', '0001']);
stock.push(['9-99999999-9', '4', 'ST', '20000.00', '5000', '1', '', '0001']);
stock.push([partRow(9)[0]!, '6', 'ST', '', '', '', '', '0001']);
stock.push([partRow(14)[0]!, '208', 'L', '873600.00', '4200', '1', '', '0001']);
writeFileSync(join(OUT, '04_SAP_opening_stock_demo.csv'), toCsv(['MATNR', 'LABST', 'MEINS', 'SALK3', 'VERPR', 'PEINH', 'CHARG', 'LGORT'], stock));

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
// Deliberate mistakes: an unknown customer, a dollar invoice, no invoice number, a date that is not a date, the same invoice twice.
inv.push(['0090009001', '10.10.2024', '0009999999', '150000.00', '11250.00', 'NGN', '', 'F2', 'Unknown customer']);
inv.push(['0090009002', '11.10.2024', kunnr(3), '2000.00', '0.00', 'USD', '', 'F2', 'Export spare parts']);
inv.push(['', '12.10.2024', kunnr(4), '80000.00', '6000.00', 'NGN', '', 'F2', 'No invoice number']);
inv.push(['0090009003', '31.06.2024', kunnr(5), '80000.00', '6000.00', 'NGN', '', 'F2', 'No such day']);
inv.push([inv[0]![0]!, inv[0]![1]!, inv[0]![2]!, inv[0]![3]!, inv[0]![4]!, 'NGN', inv[0]![6]!, 'F2', 'Exported twice']);
// SAP numbers documents per company code and fiscal year: the same number comes back in a later year (both load, labelled "· 2025" and "· 2026").
inv.push(['0090005000', '20.03.2025', kunnr(2), '64000.00', '4800.00', 'NGN', vin(2), 'F2', 'Wheel alignment']);
inv.push(['0090005000', '18.02.2026', kunnr(2), '71000.00', '5325.00', 'NGN', vin(2), 'F2', 'Service 30,000 km']);
// Company code 1000 and the fiscal year (here the calendar year) on every line, as a billing extract has them.
const withRange = inv.map((r) => [...r, '1000', (r[1]!.match(/(\d{4})$/) ?? ['', ''])[1]!]);
writeFileSync(join(OUT, '06_SAP_invoice_history_demo.csv'), toCsv(['VBELN', 'FKDAT', 'KUNAG', 'NETWR', 'MWSBK', 'WAERK', 'VHVIN', 'FKART', 'ARKTX', 'BUKRS', 'GJAHR'], withRange));

// ── The plant's registers (Excel, as kept on the line today) ────────────
// PDI register: one workbook, no "register" column (chosen when importing). Two steps per vehicle.
const INSPECTORS = ['A. Bello', 'C. Okoro', 'F. Adebayo', 'M. Yusuf'];
const pdi: (string | number)[][] = [['VIN', 'Model', 'PDI date', 'Step', 'Result', 'Inspected by', 'Report no', 'Remarks']];
for (let i = 1; i <= 30; i += 1) {
  const [, model] = MODELS[i % MODELS.length]!;
  const date = `${String(1 + (i % 27)).padStart(2, '0')}/${String(1 + (i % 12)).padStart(2, '0')}/${2023 + (i % 3)}`;
  const insp = INSPECTORS[i % INSPECTORS.length]!;
  pdi.push([vin(i), model, date, 'Final inspection', i % 9 === 0 ? 'NG' : 'OK', insp, `PDI-${2023 + (i % 3)}-${String(i).padStart(4, '0')}`, i % 9 === 0 ? 'Door seal leaking; rectified and re-inspected' : '']);
  pdi.push([vin(i), model, date, 'Road test', 'OK', insp, `PDI-${2023 + (i % 3)}-${String(i).padStart(4, '0')}`, '']);
}
pdi.push(['', 'NQR 71', '02/02/2024', 'Road test', 'OK', 'A. Bello', 'PDI-2024-9999', 'No VIN written']);
writeFileSync(join(OUT, '07_PDI_register_demo.xlsx'), writeXlsx([{ name: 'PDI register', header: true, rows: pdi, widths: [22, 10, 12, 16, 8, 14, 14, 40] }]));

// Production and QC register: one sheet with a "Register" column (line stations, then the QC gates).
const prod: string[][] = [];
for (let i = 1; i <= 30; i += 1) {
  const [, model] = MODELS[i % MODELS.length]!;
  const y = 2023 + (i % 3);
  const mo = String(1 + (i % 12)).padStart(2, '0');
  prod.push(['Production', vin(i), model, `${y}${mo}05`, 'Chassis and frame', 'Pass', 'Line 1', '']);
  prod.push(['Production', vin(i), model, `${y}${mo}06`, 'Trim and final assembly', 'Pass', 'Line 1', '']);
  prod.push(['QC', vin(i), model, `${y}${mo}07`, 'Water test', i % 11 === 0 ? 'Rework' : 'Pass', INSPECTORS[(i + 1) % INSPECTORS.length]!, i % 11 === 0 ? 'Windscreen seal resealed' : '']);
  prod.push(['QC', vin(i), model, `${y}${mo}07`, 'Final QC gate', 'Pass', INSPECTORS[(i + 2) % INSPECTORS.length]!, '']);
}
writeFileSync(join(OUT, '08_production_QC_register_demo.csv'), toCsv(['Register', 'VIN', 'Model', 'Date', 'Station', 'Result', 'Inspected by', 'Remarks'], prod));

// The 800,000-row file for the measured speed run (not committed): PERF_PARTS=800000 PERF_OUT=/some/dir
if (process.env.PERF_PARTS && process.env.PERF_OUT) {
  writeParts(Number(process.env.PERF_PARTS), join(process.env.PERF_OUT, `SAP_parts_${process.env.PERF_PARTS}.csv`));
  console.log(`Speed-run file: ${process.env.PERF_PARTS} parts in ${process.env.PERF_OUT}`);
}

console.log(`Demo files written to ${OUT}`);
