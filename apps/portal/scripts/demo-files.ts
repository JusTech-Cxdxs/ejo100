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

console.log(`Demo files written to ${OUT}`);
