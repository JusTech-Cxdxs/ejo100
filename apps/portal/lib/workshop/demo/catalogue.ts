/**
 * The workshop demo's catalogue: the invented customers, vehicles, parts,
 * suppliers, providers and texts the plan (./plan.ts) draws on. Pure data.
 * Nothing here is a real person, company or number: phones are on the
 * 0800 000 range, plates are LND/LSR/KJA-style but invented, VINs carry the
 * demo's own serial block, and no customer has an email except the four
 * portal sign-ins (lib/demo/people.ts).
 */

export const DEMO_SOURCE = 'EJO-DEMO';

// ── Customers ───────────────────────────────────────────────────────────
export type CatalogueCustomer = { key: string; name: string; company?: string; phone: string; address: string; contacts?: { name: string; role: string; phone: string }[]; tags?: string[] };

const addr = (n: number) => ['Oshodi–Apapa Expressway, Isolo', 'Ikeja Industrial Estate', 'Allen Avenue, Ikeja', 'Adeniran Ogunsanya Street, Surulere', 'Ago Palace Way, Okota', 'Ikorodu Road, Ojota', 'Lekki–Epe Expressway, Ajah', 'Kudirat Abiola Way, Oregun', 'Awolowo Road, Ikoyi', 'Apapa Oshodi Expressway, Mile 2', 'Ladipo Street, Mushin', 'Western Avenue, Ojuelegba', 'Herbert Macaulay Way, Yaba', 'Ogba Industrial Estate', 'Lagos–Abeokuta Expressway, Abule Egba', 'Murtala Muhammed Airport Road, Ikeja', 'Idimu Road, Ikotun', 'Badagry Expressway, Ojo', 'Isheri Road, Magodo', 'Old Ojo Road, Agboju'][n % 20]!;

/** 36 customers besides the four portal sign-ins: individuals and fleets. */
export const CUSTOMERS: CatalogueCustomer[] = [
  { key: 'c01', name: 'Olumide Bankole', phone: '0800 000 0201', address: `11 ${addr(0)}, Lagos` },
  { key: 'c02', name: 'Amaka Ezeani', phone: '0800 000 0202', address: `4 ${addr(2)}, Lagos` },
  { key: 'c03', name: 'Yakubu Mohammed', phone: '0800 000 0203', address: `27 ${addr(4)}, Lagos` },
  { key: 'c04', name: 'Folake Oyebode', phone: '0800 000 0204', address: `9 ${addr(5)}, Lagos` },
  { key: 'c05', name: 'Chukwudi Anyanwu', phone: '0800 000 0205', address: `18 ${addr(6)}, Lagos` },
  { key: 'c06', name: 'Rukayat Lawal', phone: '0800 000 0206', address: `2 ${addr(8)}, Lagos` },
  { key: 'c07', name: 'Ebuka Okorie', phone: '0800 000 0207', address: `31 ${addr(11)}, Lagos` },
  { key: 'c08', name: 'Titilayo Adekunle', phone: '0800 000 0208', address: `6 ${addr(12)}, Lagos` },
  { key: 'c09', name: 'Suleiman Bello', phone: '0800 000 0209', address: `14 ${addr(14)}, Lagos` },
  { key: 'c10', name: 'Ngozi Umeh', phone: '0800 000 0210', address: `5 ${addr(16)}, Lagos` },
  { key: 'c11', name: 'Bashir Abdullahi', phone: '0800 000 0211', address: `22 ${addr(18)}, Lagos` },
  { key: 'c12', name: 'Oluwatosin Ajala', phone: '0800 000 0212', address: `8 ${addr(19)}, Lagos` },
  { key: 'c13', name: 'Ifeoma Nwankwo', phone: '0800 000 0213', address: `40 ${addr(3)}, Lagos` },
  { key: 'c14', name: 'Garba Shuaibu', phone: '0800 000 0214', address: `3 ${addr(7)}, Lagos` },
  { key: 'c15', name: 'Adebola Shittu', phone: '0800 000 0215', address: `17 ${addr(9)}, Lagos` },
  { key: 'c16', name: 'Chiamaka Obi', phone: '0800 000 0216', address: `12 ${addr(13)}, Lagos` },
  { key: 'c17', name: 'Idris Olanrewaju', phone: '0800 000 0217', address: `25 ${addr(15)}, Lagos` },
  { key: 'c18', name: 'Patience Okoye', phone: '0800 000 0218', address: `7 ${addr(17)}, Lagos` },
  { key: 'c19', name: 'Segun Fagbemi', phone: '0800 000 0219', address: `19 ${addr(1)}, Lagos` },
  { key: 'c20', name: 'Hauwa Danladi', phone: '0800 000 0220', address: `33 ${addr(10)}, Lagos` },
  // Fleets and companies.
  { key: 'f01', name: 'Ojuelegba Bottling Company Ltd', company: 'Ojuelegba Bottling Company Ltd', phone: '0800 000 0301', address: `Plot 12, ${addr(1)}, Lagos`, contacts: [{ name: 'Fleet desk — Mr Adewale', role: 'Fleet Manager', phone: '0800 000 0311' }], tags: ['fleet'] },
  { key: 'f02', name: 'Apapa Cold Chain Logistics', company: 'Apapa Cold Chain Logistics Ltd', phone: '0800 000 0302', address: `Berth 5 Access Road, ${addr(9)}, Lagos`, contacts: [{ name: 'Transport office — Mrs Ekong', role: 'Transport Officer', phone: '0800 000 0312' }], tags: ['fleet'] },
  { key: 'f03', name: 'Mushin Building Materials', company: 'Mushin Building Materials Ltd', phone: '0800 000 0303', address: `48 ${addr(10)}, Lagos`, contacts: [{ name: 'Yard — Alhaji Tunde', role: 'Yard Supervisor', phone: '0800 000 0313' }], tags: ['fleet'] },
  { key: 'f04', name: 'Lekki Waste Services', company: 'Lekki Waste Services Ltd', phone: '0800 000 0304', address: `Km 18, ${addr(6)}, Lagos`, contacts: [{ name: 'Operations — Mr Chinedu', role: 'Operations Manager', phone: '0800 000 0314' }], tags: ['fleet'] },
  { key: 'f05', name: 'Yaba School Transport', company: 'Yaba Schools Transport Cooperative', phone: '0800 000 0305', address: `2 ${addr(12)}, Lagos`, tags: ['fleet'] },
  { key: 'f06', name: 'Ikeja Pharma Distribution', company: 'Ikeja Pharma Distribution Ltd', phone: '0800 000 0306', address: `Unit 3, ${addr(13)}, Lagos`, contacts: [{ name: 'Dispatch — Ms Bolanle', role: 'Dispatch Lead', phone: '0800 000 0316' }], tags: ['fleet'] },
  { key: 'f07', name: 'Ojo Farm Produce', company: 'Ojo Farm Produce Ltd', phone: '0800 000 0307', address: `Km 3, ${addr(17)}, Lagos`, tags: ['fleet'] },
  { key: 'f08', name: 'Surulere Courier Express', company: 'Surulere Courier Express Ltd', phone: '0800 000 0308', address: `21 ${addr(3)}, Lagos`, tags: ['fleet'] },
  { key: 'c21', name: 'Kelechi Ihejirika', phone: '0800 000 0221', address: `10 ${addr(5)}, Lagos` },
  { key: 'c22', name: 'Zainab Yusuf', phone: '0800 000 0222', address: `15 ${addr(7)}, Lagos` },
  { key: 'c23', name: 'Emmanuel Adeleke', phone: '0800 000 0223', address: `28 ${addr(8)}, Lagos` },
  { key: 'c24', name: 'Blessing Udoh', phone: '0800 000 0224', address: `6 ${addr(11)}, Lagos` },
  { key: 'c25', name: 'Mustapha Sani', phone: '0800 000 0225', address: `9 ${addr(14)}, Lagos` },
  { key: 'c26', name: 'Omolara Dosunmu', phone: '0800 000 0226', address: `36 ${addr(16)}, Lagos` },
  { key: 'c27', name: 'Chinonso Eke', phone: '0800 000 0227', address: `13 ${addr(18)}, Lagos` },
  { key: 'c28', name: 'Aisha Mamman', phone: '0800 000 0228', address: `24 ${addr(2)}, Lagos` },
];

// ── Vehicles ────────────────────────────────────────────────────────────
export type CatalogueModel = { make: string; model: string; type: 'PASSENGER' | 'COMMERCIAL'; engine: string; years: [number, number] };
export const MODELS: CatalogueModel[] = [
  { make: 'Isuzu', model: 'NQR 75', type: 'COMMERCIAL', engine: '4HK1-TC', years: [2018, 2025] },
  { make: 'Isuzu', model: 'NPR 71', type: 'COMMERCIAL', engine: '4HK1-TC', years: [2017, 2025] },
  { make: 'Isuzu', model: 'FRR 90', type: 'COMMERCIAL', engine: '4HK1-TCS', years: [2016, 2024] },
  { make: 'Isuzu', model: 'FVR 34', type: 'COMMERCIAL', engine: '6HK1-TC', years: [2015, 2023] },
  { make: 'Isuzu', model: 'D-Max', type: 'PASSENGER', engine: '4JJ3-TCX', years: [2019, 2025] },
  { make: 'Isuzu', model: 'MU-X', type: 'PASSENGER', engine: '4JJ3-TCX', years: [2020, 2025] },
  { make: 'Soueast', model: 'S07', type: 'PASSENGER', engine: 'SQRE4T15C', years: [2024, 2026] },
  { make: 'Soueast', model: 'DX8S', type: 'PASSENGER', engine: 'SQRE4T15C', years: [2023, 2025] },
  { make: 'Toyota', model: 'Hilux', type: 'PASSENGER', engine: '2GD-FTV', years: [2016, 2024] },
  { make: 'Toyota', model: 'Corolla', type: 'PASSENGER', engine: '2ZR-FE', years: [2014, 2023] },
  { make: 'Toyota', model: 'Hiace', type: 'COMMERCIAL', engine: '2TR-FE', years: [2015, 2024] },
  { make: 'Hyundai', model: 'HD65', type: 'COMMERCIAL', engine: 'D4DD', years: [2016, 2023] },
  { make: 'Honda', model: 'Accord', type: 'PASSENGER', engine: 'K24W', years: [2015, 2022] },
  { make: 'Kia', model: 'Sportage', type: 'PASSENGER', engine: 'G4NA', years: [2017, 2024] },
];
export const COLOURS = ['White', 'White', 'Silver', 'Black', 'Blue', 'Grey', 'Red'];

/** Lagos-style plates, invented: three letters, three digits, two letters. */
export const PLATE_PREFIXES = ['LND', 'LSR', 'KJA', 'FST', 'AAA', 'EPE', 'APP', 'MUS', 'AGL', 'IKJ', 'LSD', 'JJJ', 'KRD', 'BDG', 'GGE'];

// ── Workshop texts ──────────────────────────────────────────────────────
export const PASSENGER_COMPLAINTS = [
  ['Brakes squeal when stopping; pedal feels soft', 'Front pads worn to the wear indicator; fluid dark', 'brakes'],
  ['Engine warning lamp on; loss of power uphill', 'Injector no. 3 under-delivering; diagnostic code P0203', 'injector'],
  ['A/C not cooling', 'System low on refrigerant; cabin filter blocked', 'ac'],
  ['Steering pulls to the left; uneven front tyre wear', 'Front toe out of specification; left tie-rod end worn', 'steering'],
  ['Rattle from the front over bumps', 'Left front stabiliser link worn', 'suspension'],
  ['Battery flat in the morning; slow cranking', 'Battery failed load test; alternator output normal', 'battery'],
  ['Clutch slipping in third gear', 'Clutch plate worn below limit; release bearing noisy', 'clutch'],
  ['Coolant warning; sweet smell after driving', 'Radiator top hose weeping at the clip; coolant 20% low', 'cooling'],
  ['Headlamp dim on the right; wipers smearing', 'Right headlamp bulb aged; wiper blades perished', 'lamps'],
  ['Knocking noise at idle; oil pressure lamp flickers', 'Oil level 1.5 L low; filter restricted; no bearing noise after top-up', 'oil'],
] as const satisfies readonly (readonly [string, string, string])[];
export const COMMERCIAL_COMPLAINTS = [
  ['Air brake pressure builds slowly; warning buzzer on start', 'Air dryer cartridge saturated; compressor delivery normal', 'airbrake'],
  ['Clutch heavy; gear changes stiff', 'Clutch hydraulic fluid contaminated; slave cylinder weeping', 'clutch'],
  ['Engine overheating under load', 'Radiator core 40% blocked with dust; fan clutch slipping', 'cooling'],
  ['Black smoke; poor pull with load', 'Air filter blocked; turbo boost pipe clamp loose', 'intake'],
  ['Rear leaf spring sagging on the left', 'Second leaf cracked, left rear; U-bolts under torque', 'spring'],
  ['Tail lamp and indicator not working on the trailer side', 'Chassis harness chafed at the cross-member; connector corroded', 'electrical'],
  ['Brakes pulling to the right under heavy braking', 'Right front brake chamber diaphragm leaking', 'brakes'],
  ['Starter motor clicks; no crank', 'Starter solenoid contacts burnt; battery terminals corroded', 'starter'],
  ['Oil leak under the gearbox', 'Gearbox output seal worn; propeller shaft flange scored', 'gearbox'],
  ['Steering wander; play at the wheel', 'Drag link ball joint worn; steering box within limits', 'steering'],
] as const satisfies readonly (readonly [string, string, string])[];
export const SERVICE_TEXTS = ['Carry out service', 'Carry out 10,000 km service', 'Carry out 20,000 km service', 'Carry out 40,000 km service', 'Periodic maintenance', 'Carry out service and brake check'];

/** Labour and parts for each kind of job: lines the technician writes. Amounts in naira. */
export type LineSpec = { type: 'LABOUR' | 'STORE_PART' | 'EXTERNAL_PART' | 'EXTERNAL_JOB' | 'INTERNAL_JOB' | 'SUNDRY'; description: string; qty?: number; price: number; partKey?: string };
export const JOB_LINES: Record<string, LineSpec[]> = {
  brakes: [{ type: 'LABOUR', description: 'Strip, clean and replace front brake pads; bleed system', price: 45_000 }, { type: 'STORE_PART', description: 'Brake pad set, front', partKey: 'pads-f', price: 48_500 }, { type: 'STORE_PART', description: 'Brake fluid DOT 4', partKey: 'brake-fluid', price: 6_500 }],
  injector: [{ type: 'LABOUR', description: 'Diagnose, remove and refit injector no. 3; clear codes', price: 60_000 }, { type: 'STORE_PART', description: 'Fuel injector', partKey: 'injector', price: 185_000 }, { type: 'STORE_PART', description: 'Fuel filter', partKey: 'fuel-filter', price: 14_500 }],
  ac: [{ type: 'LABOUR', description: 'Leak test, evacuate and recharge A/C; replace cabin filter', price: 35_000 }, { type: 'STORE_PART', description: 'Cabin air filter', partKey: 'cabin-filter', price: 9_800 }, { type: 'SUNDRY', description: 'Refrigerant R134a', price: 18_000 }],
  steering: [{ type: 'LABOUR', description: 'Replace left tie-rod end; four-wheel alignment', price: 40_000 }, { type: 'STORE_PART', description: 'Tie-rod end, left', partKey: 'tie-rod', price: 33_600 }, { type: 'EXTERNAL_JOB', description: 'Wheel alignment (Apapa Tyre Centre)', price: 15_000 }],
  suspension: [{ type: 'LABOUR', description: 'Replace front stabiliser links', price: 25_000 }, { type: 'STORE_PART', description: 'Stabiliser link', partKey: 'stab-link', qty: 2, price: 17_500 }],
  battery: [{ type: 'LABOUR', description: 'Load test, replace battery, clean terminals', price: 8_000 }, { type: 'STORE_PART', description: 'Battery 12V 75Ah', partKey: 'battery-75', price: 98_000 }],
  clutch: [{ type: 'LABOUR', description: 'Remove gearbox, replace clutch kit and release bearing, bleed hydraulics', price: 120_000 }, { type: 'STORE_PART', description: 'Clutch kit', partKey: 'clutch-kit', price: 215_000 }, { type: 'STORE_PART', description: 'Clutch fluid', partKey: 'brake-fluid', price: 6_500 }],
  cooling: [{ type: 'LABOUR', description: 'Replace top hose and clips; pressure test; refill coolant', price: 22_000 }, { type: 'STORE_PART', description: 'Radiator top hose', partKey: 'rad-hose', price: 24_000 }, { type: 'STORE_PART', description: 'Coolant concentrate 5 L', partKey: 'coolant', price: 15_500 }],
  lamps: [{ type: 'LABOUR', description: 'Replace headlamp bulb and wiper blades; aim headlamps', price: 10_000 }, { type: 'STORE_PART', description: 'Headlamp bulb H4', partKey: 'bulb-h4', price: 4_200 }, { type: 'STORE_PART', description: 'Wiper blade set', partKey: 'wiper', price: 11_000 }],
  oil: [{ type: 'LABOUR', description: 'Oil and filter change; check pressure', price: 15_000 }, { type: 'STORE_PART', description: 'Engine oil 15W-40 (4 L)', partKey: 'oil-15w40', qty: 2, price: 21_000 }, { type: 'STORE_PART', description: 'Oil filter', partKey: 'oil-filter', price: 8_900 }],
  airbrake: [{ type: 'LABOUR', description: 'Replace air dryer cartridge; drain tanks; test build-up time', price: 38_000 }, { type: 'STORE_PART', description: 'Air dryer cartridge', partKey: 'air-dryer', price: 62_000 }],
  intake: [{ type: 'LABOUR', description: 'Replace air filter; secure boost pipe; road test under load', price: 20_000 }, { type: 'STORE_PART', description: 'Air filter element (truck)', partKey: 'air-filter-t', price: 28_000 }],
  spring: [{ type: 'LABOUR', description: 'Remove rear left spring pack; replace second leaf; new U-bolts torqued', price: 85_000 }, { type: 'EXTERNAL_PART', description: 'Leaf spring second leaf, rear (sourced outside)', price: 95_000 }, { type: 'STORE_PART', description: 'U-bolt kit, rear', partKey: 'ubolt', price: 36_000 }],
  electrical: [{ type: 'LABOUR', description: 'Trace and repair chassis harness; replace connector', price: 30_000 }, { type: 'SUNDRY', description: 'Connectors, loom tape and sleeving', price: 7_500 }],
  starter: [{ type: 'LABOUR', description: 'Remove and refit starter motor; clean and protect terminals', price: 25_000 }, { type: 'EXTERNAL_JOB', description: 'Starter solenoid overhaul (Ladipo auto-electrics)', price: 35_000 }],
  gearbox: [{ type: 'LABOUR', description: 'Replace gearbox output seal; refit propeller shaft', price: 55_000 }, { type: 'STORE_PART', description: 'Gearbox output seal', partKey: 'gbx-seal', price: 19_500 }, { type: 'STORE_PART', description: 'Gear oil 80W-90 (4 L)', partKey: 'gear-oil', price: 24_000 }],
  service: [{ type: 'LABOUR', description: 'Carry out service per schedule', price: 28_000 }, { type: 'STORE_PART', description: 'Engine oil 15W-40 (4 L)', partKey: 'oil-15w40', qty: 2, price: 21_000 }, { type: 'STORE_PART', description: 'Oil filter', partKey: 'oil-filter', price: 8_900 }, { type: 'STORE_PART', description: 'Air filter element', partKey: 'air-filter', price: 12_500 }],
  'service-truck': [{ type: 'LABOUR', description: 'Carry out service per schedule (truck)', price: 45_000 }, { type: 'STORE_PART', description: 'Engine oil 15W-40 (4 L)', partKey: 'oil-15w40', qty: 4, price: 21_000 }, { type: 'STORE_PART', description: 'Oil filter (truck)', partKey: 'oil-filter-t', price: 14_000 }, { type: 'STORE_PART', description: 'Fuel filter', partKey: 'fuel-filter', price: 14_500 }],
};

// ── Store ───────────────────────────────────────────────────────────────
export type CataloguePart = { key: string; category: string; typeName: string; name: string; tracking: 'QUANTITY' | 'BATCH' | 'SERIALIZED'; uom: string; cost: number; price: number; reorder: number; safety: number; fit?: string; warrantyPolicy?: string };
export const CATEGORIES: { key: string; name: string; code: string }[] = [
  { key: 'FLU', name: 'Fluids and lubricants', code: 'FLU' }, { key: 'FIL', name: 'Filters', code: 'FIL' }, { key: 'BRK', name: 'Brakes', code: 'BRK' }, { key: 'ELE', name: 'Electrical', code: 'ELE' },
  { key: 'ENG', name: 'Engine and fuel', code: 'ENG' }, { key: 'SUS', name: 'Steering and suspension', code: 'SUS' }, { key: 'TRN', name: 'Transmission and clutch', code: 'TRN' }, { key: 'COO', name: 'Cooling', code: 'COO' }, { key: 'BOD', name: 'Body and cabin', code: 'BOD' },
];
export const PARTS: CataloguePart[] = [
  { key: 'oil-15w40', category: 'FLU', typeName: 'Engine oil', name: 'Engine oil 15W-40, 4 L', tracking: 'BATCH', uom: 'Can', cost: 14_200, price: 21_000, reorder: 40, safety: 20 },
  { key: 'gear-oil', category: 'FLU', typeName: 'Gear oil', name: 'Gear oil 80W-90, 4 L', tracking: 'BATCH', uom: 'Can', cost: 16_000, price: 24_000, reorder: 12, safety: 6 },
  { key: 'brake-fluid', category: 'FLU', typeName: 'Brake fluid', name: 'Brake fluid DOT 4, 500 ml', tracking: 'BATCH', uom: 'Bottle', cost: 4_100, price: 6_500, reorder: 24, safety: 12 },
  { key: 'coolant', category: 'FLU', typeName: 'Coolant', name: 'Coolant concentrate, 5 L', tracking: 'BATCH', uom: 'Can', cost: 10_200, price: 15_500, reorder: 15, safety: 8 },
  { key: 'oil-filter', category: 'FIL', typeName: 'Oil filter', name: 'Oil filter (passenger)', tracking: 'QUANTITY', uom: 'Piece', cost: 5_600, price: 8_900, reorder: 30, safety: 15 },
  { key: 'oil-filter-t', category: 'FIL', typeName: 'Oil filter', name: 'Oil filter (Isuzu N-series)', tracking: 'QUANTITY', uom: 'Piece', cost: 9_100, price: 14_000, reorder: 20, safety: 10, fit: 'Isuzu' },
  { key: 'air-filter', category: 'FIL', typeName: 'Air filter', name: 'Air filter element (passenger)', tracking: 'QUANTITY', uom: 'Piece', cost: 7_900, price: 12_500, reorder: 20, safety: 10 },
  { key: 'air-filter-t', category: 'FIL', typeName: 'Air filter', name: 'Air filter element (Isuzu N-series)', tracking: 'QUANTITY', uom: 'Piece', cost: 18_500, price: 28_000, reorder: 12, safety: 6, fit: 'Isuzu' },
  { key: 'fuel-filter', category: 'FIL', typeName: 'Fuel filter', name: 'Fuel filter, diesel', tracking: 'QUANTITY', uom: 'Piece', cost: 9_200, price: 14_500, reorder: 25, safety: 12 },
  { key: 'cabin-filter', category: 'FIL', typeName: 'Cabin filter', name: 'Cabin air filter', tracking: 'QUANTITY', uom: 'Piece', cost: 6_100, price: 9_800, reorder: 15, safety: 8 },
  { key: 'air-dryer', category: 'BRK', typeName: 'Air dryer cartridge', name: 'Air dryer cartridge (truck)', tracking: 'QUANTITY', uom: 'Piece', cost: 41_000, price: 62_000, reorder: 6, safety: 3, fit: 'Isuzu' },
  { key: 'pads-f', category: 'BRK', typeName: 'Brake pads', name: 'Brake pad set, front', tracking: 'QUANTITY', uom: 'Set', cost: 31_500, price: 48_500, reorder: 12, safety: 6, warrantyPolicy: 'pads-6m' },
  { key: 'pads-r', category: 'BRK', typeName: 'Brake pads', name: 'Brake pad set, rear', tracking: 'QUANTITY', uom: 'Set', cost: 27_000, price: 41_500, reorder: 10, safety: 5, warrantyPolicy: 'pads-6m' },
  { key: 'battery-75', category: 'ELE', typeName: 'Battery', name: 'Battery 12V 75Ah', tracking: 'SERIALIZED', uom: 'Piece', cost: 64_000, price: 98_000, reorder: 6, safety: 3, warrantyPolicy: 'battery-12m' },
  { key: 'battery-100', category: 'ELE', typeName: 'Battery', name: 'Battery 12V 100Ah (truck)', tracking: 'SERIALIZED', uom: 'Piece', cost: 92_000, price: 140_000, reorder: 4, safety: 2, fit: 'Isuzu', warrantyPolicy: 'battery-12m' },
  { key: 'bulb-h4', category: 'ELE', typeName: 'Bulb', name: 'Headlamp bulb H4 12V', tracking: 'QUANTITY', uom: 'Piece', cost: 2_600, price: 4_200, reorder: 30, safety: 15 },
  { key: 'wiper', category: 'ELE', typeName: 'Wiper blades', name: 'Wiper blade set', tracking: 'QUANTITY', uom: 'Set', cost: 6_900, price: 11_000, reorder: 15, safety: 8 },
  { key: 'alternator', category: 'ELE', typeName: 'Alternator', name: 'Alternator 24V (Isuzu N-series)', tracking: 'SERIALIZED', uom: 'Piece', cost: 165_000, price: 245_000, reorder: 2, safety: 1, fit: 'Isuzu' },
  { key: 'injector', category: 'ENG', typeName: 'Injector', name: 'Fuel injector (4HK1)', tracking: 'SERIALIZED', uom: 'Piece', cost: 121_000, price: 185_000, reorder: 4, safety: 2, fit: 'Isuzu' },
  { key: 'glow-plug', category: 'ENG', typeName: 'Glow plug', name: 'Glow plug', tracking: 'QUANTITY', uom: 'Piece', cost: 5_800, price: 9_200, reorder: 16, safety: 8 },
  { key: 'belt', category: 'ENG', typeName: 'Drive belt', name: 'Drive belt (serpentine)', tracking: 'QUANTITY', uom: 'Piece', cost: 11_500, price: 18_000, reorder: 10, safety: 5 },
  { key: 'tie-rod', category: 'SUS', typeName: 'Tie-rod end', name: 'Tie-rod end', tracking: 'QUANTITY', uom: 'Piece', cost: 21_000, price: 33_600, reorder: 8, safety: 4 },
  { key: 'stab-link', category: 'SUS', typeName: 'Stabiliser link', name: 'Stabiliser link', tracking: 'QUANTITY', uom: 'Piece', cost: 11_000, price: 17_500, reorder: 10, safety: 5 },
  { key: 'shock-f', category: 'SUS', typeName: 'Shock absorber', name: 'Shock absorber, front', tracking: 'QUANTITY', uom: 'Piece', cost: 38_000, price: 58_000, reorder: 6, safety: 3 },
  { key: 'ubolt', category: 'SUS', typeName: 'U-bolt kit', name: 'U-bolt kit, rear (truck)', tracking: 'QUANTITY', uom: 'Kit', cost: 23_000, price: 36_000, reorder: 6, safety: 3, fit: 'Isuzu' },
  { key: 'clutch-kit', category: 'TRN', typeName: 'Clutch kit', name: 'Clutch kit (4HK1)', tracking: 'SERIALIZED', uom: 'Kit', cost: 142_000, price: 215_000, reorder: 3, safety: 1, fit: 'Isuzu' },
  { key: 'gbx-seal', category: 'TRN', typeName: 'Seal', name: 'Gearbox output seal', tracking: 'QUANTITY', uom: 'Piece', cost: 12_500, price: 19_500, reorder: 6, safety: 3 },
  { key: 'rad-hose', category: 'COO', typeName: 'Hose', name: 'Radiator top hose', tracking: 'QUANTITY', uom: 'Piece', cost: 15_500, price: 24_000, reorder: 8, safety: 4 },
  { key: 'thermostat', category: 'COO', typeName: 'Thermostat', name: 'Thermostat 82 °C', tracking: 'QUANTITY', uom: 'Piece', cost: 9_800, price: 15_500, reorder: 8, safety: 4 },
  { key: 'fan-clutch', category: 'COO', typeName: 'Fan clutch', name: 'Fan clutch (Isuzu N-series)', tracking: 'QUANTITY', uom: 'Piece', cost: 68_000, price: 105_000, reorder: 2, safety: 1, fit: 'Isuzu' },
  { key: 'mirror', category: 'BOD', typeName: 'Mirror', name: 'Door mirror assembly, left (truck)', tracking: 'QUANTITY', uom: 'Piece', cost: 27_000, price: 42_000, reorder: 4, safety: 2, fit: 'Isuzu' },
  { key: 'door-handle', category: 'BOD', typeName: 'Handle', name: 'Door handle, outer', tracking: 'QUANTITY', uom: 'Piece', cost: 8_400, price: 13_500, reorder: 6, safety: 3 },
];

export type CatalogueSupplier = { key: string; name: string; contact: string; phone: string; address: string; sells: string[] };
export const SUPPLIERS: CatalogueSupplier[] = [
  { key: 's-isuzu', name: 'Isuzu Parts Centre (Kewalram)', contact: 'Parts desk', phone: '0800 000 0401', address: 'Oshodi–Apapa Expressway, Isolo, Lagos', sells: ['oil-filter-t', 'air-filter-t', 'air-dryer', 'alternator', 'injector', 'ubolt', 'clutch-kit', 'fan-clutch', 'mirror', 'battery-100'] },
  { key: 's-lub', name: 'Lagos Lubricants Distribution', contact: 'Mr Okafor', phone: '0800 000 0402', address: 'Ladipo Street, Mushin, Lagos', sells: ['oil-15w40', 'gear-oil', 'brake-fluid', 'coolant'] },
  { key: 's-filters', name: 'Apapa Filter Supplies', contact: 'Mrs Bassey', phone: '0800 000 0403', address: 'Apapa Oshodi Expressway, Lagos', sells: ['oil-filter', 'air-filter', 'fuel-filter', 'cabin-filter'] },
  { key: 's-brakes', name: 'Ikeja Brake & Friction', contact: 'Mr Adeyinka', phone: '0800 000 0404', address: 'Ogba Industrial Estate, Lagos', sells: ['pads-f', 'pads-r'] },
  { key: 's-electric', name: 'Ojota Auto Electrics', contact: 'Alhaji Musa', phone: '0800 000 0405', address: 'Ikorodu Road, Ojota, Lagos', sells: ['battery-75', 'bulb-h4', 'wiper', 'glow-plug', 'belt'] },
  { key: 's-chassis', name: 'Mushin Chassis Parts', contact: 'Mr Nnamdi', phone: '0800 000 0406', address: 'Ladipo Street, Mushin, Lagos', sells: ['tie-rod', 'stab-link', 'shock-f', 'gbx-seal', 'rad-hose', 'thermostat', 'door-handle'] },
];

// ── Warranty ────────────────────────────────────────────────────────────
export const PROVIDERS: { key: string; name: string; type: 'MANUFACTURER' | 'SUPPLIER' | 'COMPONENT_MAKER'; contact: string; phone: string; claimDays: number; retentionDays: number }[] = [
  { key: 'p-isuzu', name: 'Isuzu Motors Ltd (demo)', type: 'MANUFACTURER', contact: 'Warranty desk, Yokohama', phone: '0800 000 0501', claimDays: 30, retentionDays: 90 },
  { key: 'p-soueast', name: 'Soueast Motor Co., Ltd (demo)', type: 'MANUFACTURER', contact: 'After-sales, Fuzhou', phone: '0800 000 0502', claimDays: 45, retentionDays: 60 },
  { key: 'p-electric', name: 'Ojota Auto Electrics (demo)', type: 'SUPPLIER', contact: 'Alhaji Musa', phone: '0800 000 0405', claimDays: 14, retentionDays: 30 },
  { key: 'p-brakes', name: 'Ikeja Brake & Friction (demo)', type: 'COMPONENT_MAKER', contact: 'Mr Adeyinka', phone: '0800 000 0404', claimDays: 21, retentionDays: 30 },
];
export const POLICIES: { key: string; code: string; name: string; kind: 'ASSET' | 'PART'; provider: string; months: number; km?: number; brand?: string; coverage: string; exclusions: string; remedy: 'REIMBURSEMENT' | 'REPLACEMENT' | 'REPAIR' }[] = [
  { key: 'isuzu-3y', code: 'DEMO-ISZ-3Y', name: 'Isuzu new vehicle warranty, 3 years / 100,000 km', kind: 'ASSET', provider: 'p-isuzu', months: 36, km: 100_000, brand: 'Isuzu', coverage: 'Defects in material and workmanship on the complete vehicle; parts and labour at an authorised workshop.', exclusions: 'Wear items (pads, clutch plate, wipers, bulbs), damage from misuse, overloading or accident, unauthorised modification.', remedy: 'REPAIR' },
  { key: 'soueast-5y', code: 'DEMO-SEM-5Y', name: 'Soueast new vehicle warranty, 5 years / 150,000 km', kind: 'ASSET', provider: 'p-soueast', months: 60, km: 150_000, brand: 'Soueast', coverage: 'Defects in material and workmanship; powertrain and electrical systems included.', exclusions: 'Wear items, tyres, paint damage from stone chips, accident damage.', remedy: 'REPAIR' },
  { key: 'battery-12m', code: 'DEMO-BAT-12M', name: 'Battery, 12 months', kind: 'PART', provider: 'p-electric', months: 12, coverage: 'Replacement of a battery that fails a load test within 12 months of fitting.', exclusions: 'Physical damage, deep discharge from a fault elsewhere in the vehicle.', remedy: 'REPLACEMENT' },
  { key: 'pads-6m', code: 'DEMO-PAD-6M', name: 'Brake pads, 6 months', kind: 'PART', provider: 'p-brakes', months: 6, coverage: 'Manufacturing defects in the friction material (cracking, separation).', exclusions: 'Normal wear; damage from scored discs.', remedy: 'REPLACEMENT' },
];

// ── Security, scheduling, support texts ─────────────────────────────────
export const VISITOR_PURPOSES = ['Bringing a vehicle for service', 'Collecting a vehicle', 'Supplier delivery follow-up', 'Insurance assessor inspection', 'Estimate discussion with the supervisor', 'Fleet account meeting', 'Job interview', 'Audit visit'];
export const VISITOR_COMPANIES = ['', '', '', 'Leadway Assurance (demo)', 'AIICO (demo)', 'Fleet owner', 'Lagos State Ministry of Transport (demo)', 'Internal audit, Headquarters'];
export const EXIT_REASONS = ['Collect parts from Ladipo market', 'Bank: lodge the day’s cash', 'Deliver documents to Headquarters', 'Customer site visit — fleet vehicle will not start', 'Medical appointment', 'Wheel alignment at Apapa Tyre Centre'];
export const INCIDENTS: { type: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; location: string; text: string; action: string }[] = [
  { type: 'Vehicle leaving without release', severity: 'HIGH', location: 'Main gate', text: 'A customer attempted to drive a vehicle out before the balance was paid; stopped at the gate.', action: 'Vehicle returned to the yard; Front Desk and Finance informed.' },
  { type: 'Lost visitor pass', severity: 'LOW', location: 'Reception', text: 'Visitor could not find the pass issued at the gate.', action: 'Pass cancelled; new pass issued against ID.' },
  { type: 'Property damage', severity: 'MEDIUM', location: 'Yard, bay 4', text: 'Reversing truck scraped the yard barrier.', action: 'Barrier inspected; driver statement taken.' },
  { type: 'Suspicious activity', severity: 'MEDIUM', location: 'Perimeter fence, east', text: 'Two persons loitering at the fence after close of business.', action: 'Patrol increased; police post informed.' },
  { type: 'Employee going out without an exit pass', severity: 'MEDIUM', location: 'Pedestrian gate', text: 'A technician left the premises at 11:40 without a pass.', action: 'Returned at 12:10; supervisor informed.' },
  { type: 'Fire or safety hazard', severity: 'HIGH', location: 'Store, oil rack', text: 'Oil spill from a leaking can near the electrical panel.', action: 'Spill contained with absorbent; can quarantined; store cleaned.' },
];
export const APPOINTMENT_TITLES = ['Fleet account review', 'Estimate discussion', 'Supplier price review', 'Weekly workshop planning', 'Warranty claim review with the HOD', 'Safety toolbox talk', 'Customer complaint follow-up', 'Monthly stock count planning', 'Training: the new estimate matching', 'Security briefing'];
export const BROADCASTS: { category: 'NEWS' | 'ANNOUNCEMENT' | 'IMPORTANT' | 'URGENT' | 'SECURITY_ALERT' | 'MAINTENANCE' | 'GREETING'; title: string; message: string; daysAgo: number; days: number; audience: 'ALL' | 'BRANCH' | 'CUSTOMERS_ALL' }[] = [
  { category: 'MAINTENANCE', title: 'Generator service on Saturday', message: 'The standby generator will be serviced on Saturday from 08:00 to 12:00. Expect short power interruptions in the workshop and the store.', daysAgo: 3, days: 6, audience: 'BRANCH' },
  { category: 'ANNOUNCEMENT', title: 'Stock count on the last Friday', message: 'The store closes to releases from 14:00 on the last Friday of the month for the stock count. Raise parts slips before noon.', daysAgo: 10, days: 30, audience: 'BRANCH' },
  { category: 'SECURITY_ALERT', title: 'Visitor passes must be returned', message: 'Every visitor pass is returned at the gate on the way out. Security will hold any vehicle whose driver has no pass to return.', daysAgo: 20, days: 60, audience: 'ALL' },
  { category: 'NEWS', title: 'Afprint builds its 300th truck', message: 'The assembly plant passed its 300th Isuzu NQR through final inspection this week. Well done to the line and the quality team.', daysAgo: 14, days: 30, audience: 'ALL' },
  { category: 'GREETING', title: 'Happy new month', message: 'Thank you for a strong month in the workshop and the store. The management wishes every colleague a good month ahead.', daysAgo: 1, days: 7, audience: 'ALL' },
  { category: 'IMPORTANT', title: 'Extended service hours this month', message: 'The Isolo workshop opens until 18:00 on weekdays this month for fleet customers. Book a slot with the front desk.', daysAgo: 5, days: 25, audience: 'CUSTOMERS_ALL' },
];
export const TICKETS: { channel: 'CUSTOMER_PORTAL' | 'WEBSITE' | 'EMAIL' | 'STAFF'; subject: string; summary: string; priority: 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW'; status: 'OPEN' | 'WAITING_ON_CUSTOMER' | 'ON_HOLD' | 'RESOLVED' | 'CLOSED'; daysAgo: number; replies: { from: 'customer' | 'agent' | 'ai' | 'note'; text: string; hoursLater: number }[]; customerKey?: string; complaint?: boolean }[] = [
  { channel: 'CUSTOMER_PORTAL', subject: 'When will my vehicle be ready?', summary: 'My S07 has been in since Monday for the service; the portal still says in service.', priority: 'NORMAL', status: 'OPEN', daysAgo: 1, customerKey: 'customer.adaora', replies: [{ from: 'ai', text: 'Thank you for your message. Your service is in progress; the estimate was approved on Monday and the workshop expects to finish today. A colleague will confirm the collection time.', hoursLater: 0.2 }] },
  { channel: 'EMAIL', subject: 'Complaint: scratch on the bonnet after the service', summary: 'The vehicle came back with a scratch on the bonnet that was not there before. I want it looked at.', priority: 'HIGH', status: 'OPEN', daysAgo: 2, customerKey: 'c08', complaint: true, replies: [{ from: 'agent', text: 'We are sorry about this. Our supervisor will inspect the vehicle on your next visit and compare it with the check-in photographs. May we book you in on Thursday at 09:00?', hoursLater: 3 }, { from: 'customer', text: 'Thursday 09:00 is fine.', hoursLater: 6 }] },
  { channel: 'WEBSITE', subject: 'Do you service Hyundai trucks?', summary: 'I run three HD65 trucks. Do you take them, and what is the service price?', priority: 'LOW', status: 'RESOLVED', daysAgo: 12, replies: [{ from: 'agent', text: 'Yes, our commercial workshop services the HD65. A standard service is from ₦95,000 depending on the oil grade; bring the vehicle in any weekday from 07:30.', hoursLater: 2 }] },
  { channel: 'CUSTOMER_PORTAL', subject: 'Invoice for last month’s service', summary: 'Please send the invoice for the 40,000 km service on the NPR, plate LND 212 CD, for our records.', priority: 'NORMAL', status: 'RESOLVED', daysAgo: 20, customerKey: 'customer.fleet', replies: [{ from: 'agent', text: 'Attached to this reply. The invoice is also under Orders in your portal.', hoursLater: 1.5 }] },
  { channel: 'STAFF', subject: 'Printer on the front desk not printing job cards', summary: 'The front desk printer shows a paper jam light but there is no paper stuck.', priority: 'NORMAL', status: 'CLOSED', daysAgo: 15, replies: [{ from: 'agent', text: 'Rollers cleaned and the sensor reset; printing again.', hoursLater: 2 }] },
  { channel: 'EMAIL', subject: 'Warranty claim status', summary: 'My claim for the alternator was submitted three weeks ago. What is the status?', priority: 'HIGH', status: 'WAITING_ON_CUSTOMER', daysAgo: 4, customerKey: 'customer.warranty', replies: [{ from: 'agent', text: 'Isuzu has acknowledged the claim and asked for the failure reading at the time of the fault. Could you confirm the odometer reading when the warning lamp first came on?', hoursLater: 5 }] },
  { channel: 'WEBSITE', subject: 'Opening hours on public holidays', summary: 'Are you open on the public holiday next week?', priority: 'LOW', status: 'CLOSED', daysAgo: 30, replies: [{ from: 'ai', text: 'The workshop is closed on public holidays; the front desk answers calls from 08:00 to 14:00 for emergencies.', hoursLater: 0.1 }] },
  { channel: 'CUSTOMER_PORTAL', subject: 'Change the contact phone on my account', summary: 'My number has changed; please update it to the one on this message.', priority: 'LOW', status: 'RESOLVED', daysAgo: 25, customerKey: 'c02', replies: [{ from: 'agent', text: 'Updated. You will receive the next service reminder on the new number.', hoursLater: 1 }] },
  { channel: 'STAFF', subject: 'Cannot see the parts request on JC', summary: 'I raised a parts slip but the store says it is not in their queue.', priority: 'HIGH', status: 'RESOLVED', daysAgo: 6, replies: [{ from: 'note', text: 'Slip was waiting for the HOD; the Head of Department approved it at 14:10.', hoursLater: 1 }, { from: 'agent', text: 'The slip needed the department head first; it is now with the store.', hoursLater: 1.2 }] },
  { channel: 'EMAIL', subject: 'Fleet service schedule for December', summary: 'Please propose a schedule for our eight trucks in December.', priority: 'NORMAL', status: 'ON_HOLD', daysAgo: 8, customerKey: 'f02', replies: [{ from: 'agent', text: 'We will send a proposed schedule once the December bay plan is confirmed next week.', hoursLater: 4 }] },
  { channel: 'WEBSITE', subject: 'Price of a D-Max service', summary: 'How much is the 20,000 km service for a 2022 D-Max?', priority: 'LOW', status: 'RESOLVED', daysAgo: 40, replies: [{ from: 'ai', text: 'The 20,000 km service for the D-Max is from ₦78,000 including oil, filters and labour.', hoursLater: 0.1 }] },
  { channel: 'CUSTOMER_PORTAL', subject: 'Estimate seems high', summary: 'The estimate for the clutch is more than I expected. Can it be reviewed?', priority: 'NORMAL', status: 'CLOSED', daysAgo: 45, customerKey: 'c05', replies: [{ from: 'agent', text: 'The supervisor has reviewed it: the clutch kit is a genuine part with a warranty; the labour includes removing the gearbox. We can offer the kit at the fleet price, which brings the estimate down by ₦18,000.', hoursLater: 20 }, { from: 'customer', text: 'Thank you, please go ahead.', hoursLater: 26 }] },
  { channel: 'EMAIL', subject: 'Request: copy of the PDI certificate', summary: 'I bought my NQR from Afprint in July; please send the PDI certificate.', priority: 'NORMAL', status: 'RESOLVED', daysAgo: 50, customerKey: 'customer.afprint', replies: [{ from: 'agent', text: 'The certificate is attached and is also on the vehicle’s page in your portal.', hoursLater: 3 }] },
  { channel: 'STAFF', subject: 'Scanner at the store gate not reading labels', summary: 'The barcode scanner reads nothing since this morning.', priority: 'URGENT', status: 'OPEN', daysAgo: 0.2, replies: [] },
  { channel: 'WEBSITE', subject: 'Complaint: waited two hours at reception', summary: 'I waited two hours on Tuesday before anyone attended to me.', priority: 'HIGH', status: 'OPEN', daysAgo: 3, complaint: true, replies: [{ from: 'ai', text: 'We are sorry for the wait. The Customer Care Lead has been informed and will call you today.', hoursLater: 0.2 }] },
  { channel: 'CUSTOMER_PORTAL', subject: 'Service reminder received — book me in', summary: 'The reminder says my Sportage is due at 60,000 km. Please book next Tuesday.', priority: 'NORMAL', status: 'RESOLVED', daysAgo: 9, customerKey: 'c16', replies: [{ from: 'agent', text: 'Booked for Tuesday at 08:00; the appointment is on your portal.', hoursLater: 1 }] },
  { channel: 'EMAIL', subject: 'Supplier: delivery of oil filters delayed', summary: 'Our shipment is held at the port; delivery moves to next week.', priority: 'NORMAL', status: 'CLOSED', daysAgo: 35, replies: [{ from: 'note', text: 'Store Manager informed; reorder from Apapa Filter Supplies in the meantime.', hoursLater: 2 }] },
  { channel: 'WEBSITE', subject: 'Do you buy used trucks?', summary: 'I have a 2016 FRR to sell.', priority: 'LOW', status: 'CLOSED', daysAgo: 60, replies: [{ from: 'agent', text: 'We do not buy vehicles; the sales division may be able to advise on a trade-in.', hoursLater: 24 }] },
];
export const IMPORTS: { entity: string; fileName: string; rows: number; created: number; warnings: number; rejected: number; daysAgo: number; totals?: { lines: number; quantity?: number; value: number } }[] = [
  { entity: 'customers', fileName: 'KNA0 customers 2026-05.xlsx', rows: 412, created: 406, warnings: 9, rejected: 6, daysAgo: 178 },
  { entity: 'vehicles', fileName: 'Equipment list 1000 2026-05.xlsx', rows: 538, created: 531, warnings: 14, rejected: 7, daysAgo: 177 },
  { entity: 'suppliers', fileName: 'LFA1 vendors 2026-05.csv', rows: 24, created: 24, warnings: 0, rejected: 0, daysAgo: 176 },
  { entity: 'parts', fileName: 'MARA material master 1000.xlsx', rows: 1_860, created: 1_848, warnings: 31, rejected: 12, daysAgo: 175 },
  { entity: 'stock', fileName: 'MB52 stock 1000 2026-05-08.xlsx', rows: 1_412, created: 1_412, warnings: 6, rejected: 0, daysAgo: 174, totals: { lines: 1_412, quantity: 38_640, value: 186_430_250 } },
  { entity: 'invoices', fileName: 'VBRK invoices 2024-2026.xlsx', rows: 3_215, created: 3_190, warnings: 44, rejected: 25, daysAgo: 173, totals: { lines: 3_190, value: 412_908_700 } },
  { entity: 'jobs', fileName: 'IW39 orders 2024-2026.xlsx', rows: 3_050, created: 3_011, warnings: 52, rejected: 39, daysAgo: 172 },
];
export const EXPORTS: { kind: string; format: 'xlsx' | 'csv'; summary: string; rows: number; daysAgo: number }[] = [
  { kind: 'job-cards', format: 'xlsx', summary: 'Job cards · Isolo Branch · last 30 days', rows: 61, daysAgo: 1 },
  { kind: 'parts', format: 'xlsx', summary: 'Parts and stock · Isolo Branch', rows: 31, daysAgo: 2 },
  { kind: 'customers', format: 'csv', summary: 'Customers · fleet accounts', rows: 8, daysAgo: 6 },
  { kind: 'sap-jobs', format: 'csv', summary: 'SAP job card history · 2025', rows: 1_204, daysAgo: 12 },
];
