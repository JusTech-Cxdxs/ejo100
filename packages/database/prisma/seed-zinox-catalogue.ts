/**
 * Zinox Technologies — the reference data the Zinox modules start from:
 * component parts for the line, the product families (computing, iPower, iTEC),
 * sellable configurations with their bills of materials and software,
 * checklists for the line and QA, the finished-goods locations, warranty
 * policies, the retail and dealer price lists, and two suppliers.
 * Idempotent: every row is upserted by its natural key.
 */
import type { PrismaClient, ProductFamily, SubBrand, ProductSource } from '@prisma/client';

type P = { sku: string; name: string; family: ProductFamily; subBrand: SubBrand; source: ProductSource; months: number; specs: Record<string, string>; retail: number; dealer: number; configs?: { code: string; name: string; specs: Record<string, string>; retail: number; dealer: number; isDefault?: boolean }[] };

const PRODUCTS: P[] = [
  { sku: 'ZNX-LT-PRESTIGE-PRO2', name: 'Zinox Prestige Pro2 Laptop', family: 'LAPTOP', subBrand: 'ZINOX', source: 'ASSEMBLED', months: 12, specs: { display: '14.1" FHD IPS touch', cpu: 'Intel Core i5-1235U', keyboard: 'Backlit, Naira-sign layout', security: 'Fingerprint reader', os: 'Windows 11 Pro' }, retail: 985000, dealer: 905000,
    configs: [{ code: 'I5-8-512', name: 'Core i5 · 8 GB · 512 GB SSD', specs: { ram: '8 GB DDR4', storage: '512 GB NVMe SSD' }, retail: 985000, dealer: 905000, isDefault: true }, { code: 'I5-16-512', name: 'Core i5 · 16 GB · 512 GB SSD', specs: { ram: '16 GB DDR4', storage: '512 GB NVMe SSD' }, retail: 1065000, dealer: 980000 }, { code: 'I5-16-1T', name: 'Core i5 · 16 GB · 1 TB SSD', specs: { ram: '16 GB DDR4', storage: '1 TB NVMe SSD' }, retail: 1145000, dealer: 1050000 }] },
  { sku: 'ZNX-LT-ELITE-PRO2', name: 'Zinox Elite Pro2 Laptop', family: 'LAPTOP', subBrand: 'ZINOX', source: 'ASSEMBLED', months: 12, specs: { display: '14.1" FHD IPS touch', cpu: 'Intel Core i7-1255U', keyboard: 'Backlit, Naira-sign layout', security: 'Fingerprint reader', os: 'Windows 11 Pro' }, retail: 1250000, dealer: 1150000,
    configs: [{ code: 'I7-8-512', name: 'Core i7 · 8 GB · 512 GB SSD', specs: { ram: '8 GB DDR4', storage: '512 GB NVMe SSD' }, retail: 1250000, dealer: 1150000, isDefault: true }, { code: 'I7-16-1T', name: 'Core i7 · 16 GB · 1 TB SSD', specs: { ram: '16 GB DDR4', storage: '1 TB NVMe SSD' }, retail: 1420000, dealer: 1305000 }] },
  { sku: 'ZNX-LT-PHOENIX', name: 'Zinox Phoenix Notebook', family: 'LAPTOP', subBrand: 'ZINOX', source: 'ASSEMBLED', months: 12, specs: { display: '14" HD', cpu: 'Intel Core i3', os: 'Windows 11 Home' }, retail: 585000, dealer: 540000, configs: [{ code: 'I3-8-256', name: 'Core i3 · 8 GB · 256 GB SSD', specs: { ram: '8 GB', storage: '256 GB SSD' }, retail: 585000, dealer: 540000, isDefault: true }] },
  { sku: 'ZNX-LT-BIJIMI-PRO', name: 'Zinox Bijimi Pro Laptop', family: 'LAPTOP', subBrand: 'ZINOX', source: 'ASSEMBLED', months: 12, specs: { display: '14" HD IPS', cpu: 'Intel Pentium N6000', os: 'Windows 11 Home' }, retail: 395000, dealer: 365000, configs: [{ code: 'N6-4-256', name: 'Pentium · 4 GB · 256 GB SSD', specs: { ram: '4 GB', storage: '256 GB SSD' }, retail: 395000, dealer: 365000, isDefault: true }] },
  { sku: 'ZNX-AI-PHANTOM', name: 'Zinox Phantom All-in-One', family: 'ALL_IN_ONE', subBrand: 'ZINOX', source: 'ASSEMBLED', months: 12, specs: { display: '23.8" FHD', cpu: 'Intel Core i5', os: 'Windows 11 Pro' }, retail: 890000, dealer: 820000, configs: [{ code: 'I5-8-512', name: 'Core i5 · 8 GB · 512 GB SSD', specs: { ram: '8 GB', storage: '512 GB SSD' }, retail: 890000, dealer: 820000, isDefault: true }] },
  { sku: 'ZNX-AI-APEX-PRO2', name: 'Zinox Apex Pro2 All-in-One', family: 'ALL_IN_ONE', subBrand: 'ZINOX', source: 'ASSEMBLED', months: 12, specs: { display: '27" FHD', cpu: 'Intel Core i7', os: 'Windows 11 Pro' }, retail: 1180000, dealer: 1090000, configs: [{ code: 'I7-16-1T', name: 'Core i7 · 16 GB · 1 TB SSD', specs: { ram: '16 GB', storage: '1 TB SSD' }, retail: 1180000, dealer: 1090000, isDefault: true }] },
  { sku: 'ZNX-DT-QUANTUM-PRO2', name: 'Zinox Quantum Pro2 Desktop', family: 'DESKTOP', subBrand: 'ZINOX', source: 'ASSEMBLED', months: 12, specs: { cpu: 'Intel Core i5', form: 'Tower with 22" monitor', os: 'Windows 11 Pro' }, retail: 740000, dealer: 685000, configs: [{ code: 'I5-8-512', name: 'Core i5 · 8 GB · 512 GB SSD', specs: { ram: '8 GB', storage: '512 GB SSD' }, retail: 740000, dealer: 685000, isDefault: true }] },
  { sku: 'ZNX-TB-ZPAD-X9-PRO', name: 'Zpad X9 Pro Tablet', family: 'TABLET', subBrand: 'ZINOX', source: 'FINISHED_IMPORT', months: 12, specs: { display: '10.4" 2K', ram: '8 GB', storage: '256 GB', network: '4G LTE', os: 'Android 14' }, retail: 285000, dealer: 262000 },
  { sku: 'ZNX-TB-ZPAD-X9', name: 'Zpad X9 Tablet', family: 'TABLET', subBrand: 'ZINOX', source: 'FINISHED_IMPORT', months: 12, specs: { display: '10.1" FHD', ram: '4 GB', storage: '128 GB', network: '4G LTE', os: 'Android 14' }, retail: 195000, dealer: 178000 },
  { sku: 'ZNX-TB-KIDS-LEGACY', name: 'Kids Legacy Tab Pro', family: 'TABLET', subBrand: 'ZINOX', source: 'FINISHED_IMPORT', months: 12, specs: { display: '8" HD', ram: '4 GB', storage: '64 GB', extras: 'Learning apps, rugged case' }, retail: 125000, dealer: 112000 },
  { sku: 'ZNX-MN-24FHD', name: 'Zinox 24" FHD Monitor', family: 'MONITOR', subBrand: 'ZINOX', source: 'FINISHED_IMPORT', months: 12, specs: { display: '23.8" IPS FHD 75 Hz', ports: 'HDMI, VGA' }, retail: 165000, dealer: 150000 },
  { sku: 'ZNX-SB-75', name: 'Zinox 75" Interactive Smart Board', family: 'SMART_BOARD', subBrand: 'ZINOX', source: 'FINISHED_IMPORT', months: 24, specs: { display: '75" 4K touch, 20 points', os: 'Android + OPS slot', use: 'Classrooms and boardrooms' }, retail: 3250000, dealer: 2980000 },
  { sku: 'IPW-INV-3.5K', name: 'iPower 3.5 kVA Hybrid Inverter', family: 'INVERTER', subBrand: 'IPOWER', source: 'FINISHED_IMPORT', months: 24, specs: { output: '3.5 kVA / 24 V', charger: 'MPPT solar charge controller', display: 'LCD' }, retail: 485000, dealer: 445000 },
  { sku: 'IPW-INV-5K', name: 'iPower 5 kVA Hybrid Inverter', family: 'INVERTER', subBrand: 'IPOWER', source: 'FINISHED_IMPORT', months: 24, specs: { output: '5 kVA / 48 V', charger: 'MPPT solar charge controller' }, retail: 720000, dealer: 660000 },
  { sku: 'IPW-BAT-200AH', name: 'iPower 200 Ah Deep-Cycle Battery', family: 'BATTERY', subBrand: 'IPOWER', source: 'FINISHED_IMPORT', months: 12, specs: { capacity: '200 Ah / 12 V', type: 'Tubular deep-cycle' }, retail: 365000, dealer: 335000 },
  { sku: 'IPW-PNL-450W', name: 'iPower 450 W Mono Solar Panel', family: 'SOLAR_PANEL', subBrand: 'IPOWER', source: 'FINISHED_IMPORT', months: 120, specs: { output: '450 W monocrystalline', warranty: '10 years product, 25 years output' }, retail: 145000, dealer: 132000 },
  { sku: 'IPW-KIT-5K', name: 'iPower 5 kVA Solar Home Kit', family: 'SOLAR_KIT', subBrand: 'IPOWER', source: 'KIT', months: 24, specs: { contents: '5 kVA inverter, 4 × 200 Ah batteries, 8 × 450 W panels, mounting and cabling' }, retail: 3350000, dealer: 3100000 },
  { sku: 'ITC-GEN-5K', name: 'iTEC 5 kVA Generator', family: 'GENERATOR', subBrand: 'ITEC', source: 'FINISHED_IMPORT', months: 12, specs: { output: '5 kVA, key start', engine: 'Copper-wound, low-noise' }, retail: 890000, dealer: 820000 },
  { sku: 'ITC-TV-43S', name: 'iTEC 43" Smart TV', family: 'TELEVISION', subBrand: 'ITEC', source: 'FINISHED_IMPORT', months: 12, specs: { display: '43" FHD LED', smart: 'Android TV, Wi-Fi' }, retail: 285000, dealer: 262000 },
  { sku: 'ITC-TV-55U', name: 'iTEC 55" 4K Smart TV', family: 'TELEVISION', subBrand: 'ITEC', source: 'FINISHED_IMPORT', months: 12, specs: { display: '55" 4K UHD', smart: 'Android TV, Wi-Fi' }, retail: 520000, dealer: 478000 },
  { sku: 'ITC-FAN-RECH-18', name: 'iTEC 18" Rechargeable Fan', family: 'FAN', subBrand: 'ITEC', source: 'FINISHED_IMPORT', months: 6, specs: { size: '18" standing', battery: '12 hours, solar-chargeable' }, retail: 68000, dealer: 61000 },
  { sku: 'ITC-STB-5K', name: 'iTEC 5 kVA Stabiliser', family: 'STABILISER', subBrand: 'ITEC', source: 'FINISHED_IMPORT', months: 12, specs: { capacity: '5 kVA servo', range: '140–260 V' }, retail: 145000, dealer: 132000 },
];

const PARTS: { number: string; name: string; type: string; unit: string; stock: number; cost: number; reorder: number }[] = [
  { number: 'CMP-CASE-14', name: '14.1" Laptop Chassis (Prestige/Elite)', type: 'Chassis', unit: 'Each', stock: 240, cost: 38000, reorder: 100 },
  { number: 'CMP-MB-1235U', name: 'Motherboard with Intel Core i5-1235U', type: 'Motherboard', unit: 'Each', stock: 180, cost: 185000, reorder: 60 },
  { number: 'CMP-MB-1255U', name: 'Motherboard with Intel Core i7-1255U', type: 'Motherboard', unit: 'Each', stock: 90, cost: 245000, reorder: 40 },
  { number: 'CMP-RAM-8-DDR4', name: '8 GB DDR4 SO-DIMM', type: 'Memory', unit: 'Each', stock: 600, cost: 22000, reorder: 200 },
  { number: 'CMP-SSD-512', name: '512 GB NVMe SSD', type: 'Storage', unit: 'Each', stock: 420, cost: 41000, reorder: 150 },
  { number: 'CMP-SSD-1T', name: '1 TB NVMe SSD', type: 'Storage', unit: 'Each', stock: 160, cost: 69000, reorder: 60 },
  { number: 'CMP-PNL-14-FHD-T', name: '14.1" FHD IPS Touch Panel', type: 'Display panel', unit: 'Each', stock: 230, cost: 58000, reorder: 100 },
  { number: 'CMP-KB-NGN-BL', name: 'Backlit Keyboard, Naira-sign layout', type: 'Keyboard', unit: 'Each', stock: 350, cost: 9500, reorder: 120 },
  { number: 'CMP-BAT-52WH', name: '52 Wh Laptop Battery', type: 'Battery', unit: 'Each', stock: 300, cost: 24000, reorder: 100 },
  { number: 'CMP-ADP-65W', name: '65 W USB-C Power Adapter', type: 'Power adapter', unit: 'Each', stock: 380, cost: 8500, reorder: 120 },
  { number: 'CMP-FP-MOD', name: 'Fingerprint Module', type: 'Security module', unit: 'Each', stock: 260, cost: 6200, reorder: 100 },
  { number: 'CMP-BOX-LT', name: 'Laptop Retail Box with Inserts', type: 'Packaging', unit: 'Each', stock: 500, cost: 2400, reorder: 150 },
  { number: 'CMP-WCARD', name: 'Warranty Card and Quick-Start Leaflet', type: 'Packaging', unit: 'Each', stock: 1200, cost: 150, reorder: 300 },
];

export async function seedZinoxCatalogue(prisma: PrismaClient, organisationId: string, branchId: string, userId: string) {
  // Components store: category, types, parts, stock.
  const category = await prisma.partCategory.upsert({ where: { id: `${branchId}-cmp-cat` }, update: {}, create: { id: `${branchId}-cmp-cat`, branchId, name: 'Computer Components', code: 'CMP', createdById: userId } });
  const typeIds = new Map<string, string>();
  for (const t of [...new Set(PARTS.map((p) => p.type))]) {
    const row = await prisma.partType.upsert({ where: { id: `${branchId}-pt-${t.toLowerCase().replace(/\W+/g, '-')}` }, update: {}, create: { id: `${branchId}-pt-${t.toLowerCase().replace(/\W+/g, '-')}`, branchId, categoryId: category.id, name: t, createdById: userId } });
    typeIds.set(t, row.id);
  }
  const partIds = new Map<string, string>();
  for (const p of PARTS) {
    const row = await prisma.part.upsert({
      where: { id: `${branchId}-${p.number}` },
      update: {},
      create: { id: `${branchId}-${p.number}`, branchId, name: p.name, partNumber: p.number, category: 'Computer components', baseUnitOfMeasure: p.unit, reorderPoint: p.reorder, sellingPrice: Math.round(p.cost * 1.25), partTypeId: typeIds.get(p.type), createdById: userId },
    });
    await prisma.partStock.upsert({ where: { partId: row.id }, update: {}, create: { partId: row.id, quantityOnHand: p.stock } });
    partIds.set(p.number, row.id);
  }

  // Software the line installs.
  const software = [
    ['Windows 11 Pro image (Zinox build 24H2)', '24H2', 'IMAGE', true], ['Windows 11 Home image (Zinox build 24H2)', '24H2', 'IMAGE', true], ['Microsoft Office Home & Business', '2024', 'APPLICATION', true],
    ['Kaspersky Standard (1 year)', '2026', 'APPLICATION', true], ['Zinox Care agent', '3.2', 'AGENT', false], ['Intel chipset and graphics drivers', '2026.03', 'DRIVER', false],
  ] as const;
  const softwareIds = new Map<string, string>();
  for (const [name, version, kind, licence] of software) {
    const row = await prisma.softwarePackage.upsert({ where: { organisationId_name_version: { organisationId, name, version } }, update: {}, create: { organisationId, name, version, kind, licenceRequired: licence } });
    softwareIds.set(name, row.id);
  }

  // Warranty provider + policies for finished products.
  const provider = await prisma.warrantyProvider.upsert({ where: { name: 'Zinox Technologies (manufacturer warranty)' }, update: {}, create: { name: 'Zinox Technologies (manufacturer warranty)', type: 'MANUFACTURER', organisationId, claimSubmissionDays: 30, createdById: userId, contactName: 'Service Centre, Gbagada', email: 'service@zinoxtechnologies.com' } });
  const policyFor = new Map<number, string>();
  for (const [months, code, name] of [[6, 'ZNX-PROD-6M', '6-month product warranty'], [12, 'ZNX-PROD-12M', '12-month product warranty'], [24, 'ZNX-PROD-24M', '24-month product warranty'], [120, 'ZNX-PROD-120M', '10-year solar panel product warranty']] as const) {
    const row = await prisma.warrantyPolicy.upsert({ where: { code }, update: {}, create: { code, name, kind: 'PRODUCT', providerId: provider.id, durationMonths: months, coverageSummary: 'Manufacturing defects in materials and workmanship, repaired or replaced at a Zinox Service Centre.', exclusions: 'Physical damage, liquid damage, power surges without a stabiliser, unauthorised repair, consumables.', conditions: 'Proof of purchase or dealer registration; serial intact.', defaultRemedy: 'REPAIR', organisationId, createdById: userId } });
    policyFor.set(months, row.id);
  }

  // Products, configurations, BOMs, software per configuration.
  const configIds = new Map<string, string>();
  for (const p of PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { organisationId_sku: { organisationId, sku: p.sku } },
      update: {},
      create: { organisationId, sku: p.sku, name: p.name, family: p.family, subBrand: p.subBrand, source: p.source, specs: p.specs, defaultWarrantyMonths: p.months, warrantyPolicyId: policyFor.get(p.months) ?? policyFor.get(12), createdById: userId },
    });
    const configs = p.configs ?? [{ code: 'STD', name: 'Standard', specs: {}, retail: p.retail, dealer: p.dealer, isDefault: true }];
    for (const c of configs) {
      const cfg = await prisma.productConfiguration.upsert({ where: { productId_code: { productId: product.id, code: c.code } }, update: {}, create: { productId: product.id, code: c.code, name: c.name, specs: c.specs, isDefault: Boolean(c.isDefault) } });
      configIds.set(`${p.sku}/${c.code}`, cfg.id);
      if (p.family === 'LAPTOP' && p.sku !== 'ZNX-LT-PHOENIX' && p.sku !== 'ZNX-LT-BIJIMI-PRO') {
        const mb = p.sku.includes('ELITE') ? 'CMP-MB-1255U' : 'CMP-MB-1235U';
        const ramQty = c.code.includes('-16-') ? 2 : 1;
        const ssd = c.code.endsWith('-1T') ? 'CMP-SSD-1T' : 'CMP-SSD-512';
        const lines: [string, number, string][] = [['CMP-CASE-14', 1, 'ASSEMBLY'], [mb, 1, 'ASSEMBLY'], ['CMP-RAM-8-DDR4', ramQty, 'ASSEMBLY'], [ssd, 1, 'ASSEMBLY'], ['CMP-PNL-14-FHD-T', 1, 'ASSEMBLY'], ['CMP-KB-NGN-BL', 1, 'ASSEMBLY'], ['CMP-BAT-52WH', 1, 'ASSEMBLY'], ['CMP-FP-MOD', 1, 'ASSEMBLY'], ['CMP-ADP-65W', 1, 'PACKING'], ['CMP-BOX-LT', 1, 'PACKING'], ['CMP-WCARD', 1, 'PACKING']];
        for (const [num, qty, station] of lines) {
          const partId = partIds.get(num)!;
          await prisma.bomLine.upsert({ where: { configurationId_partId: { configurationId: cfg.id, partId } }, update: {}, create: { configurationId: cfg.id, partId, quantity: qty, station } });
        }
        for (const name of ['Windows 11 Pro image (Zinox build 24H2)', 'Microsoft Office Home & Business', 'Kaspersky Standard (1 year)', 'Zinox Care agent', 'Intel chipset and graphics drivers']) {
          await prisma.configurationPackage.upsert({ where: { configurationId_packageId: { configurationId: cfg.id, packageId: softwareIds.get(name)! } }, update: {}, create: { configurationId: cfg.id, packageId: softwareIds.get(name)!, required: true } });
        }
      }
    }
  }

  // Line and QA checklists.
  const checks: [ProductFamily | null, 'LINE_CHECK' | 'QA', string[]][] = [
    ['LAPTOP', 'LINE_CHECK', ['Chassis closed and screws torqued', 'Motherboard matches the configuration', 'RAM modules seated (quantity per BOM)', 'SSD fitted (capacity per BOM)', 'Keyboard layout: Naira sign present', 'Fingerprint module connected', 'BIOS version current; serial written to BIOS', 'Software image installed and activated', 'Required packages present', 'Serial and regulatory labels applied', 'Accessories per BOM in the box']],
    ['LAPTOP', 'QA', ['Burn-in 4 hours without error', 'Display: no dead pixels, touch works', 'Keyboard and touchpad: every key and gesture', 'USB-C, USB-A, HDMI and audio ports', 'Battery: charges, holds above 95% after burn-in', 'Wi-Fi and Bluetooth connect', 'Camera and microphone', 'Fingerprint enrolment', 'Speakers', 'Cosmetic inspection']],
    [null, 'LINE_CHECK', ['Unit matches the configuration', 'Serial label applied', 'Accessories complete', 'Packaging intact']],
    [null, 'QA', ['Powers on and runs 1 hour', 'All ports and controls work', 'Cosmetic inspection', 'Safety check (earth, insulation)']],
  ];
  for (const [family, stage, items] of checks) {
    const existing = await prisma.checkTemplate.count({ where: { organisationId, stage, family } });
    if (existing > 0) continue;
    await prisma.checkTemplate.createMany({ data: items.map((item, i) => ({ organisationId, family, stage, item, sortOrder: i })) });
  }

  // Finished-goods locations at the plant.
  for (const [name, kind] of [['Finished goods store', 'WAREHOUSE'], ['Showroom floor', 'SHOWROOM'], ['Quarantine', 'QUARANTINE'], ['TD Africa consignment', 'CONSIGNMENT'], ['Service Centre', 'SERVICE']] as const) {
    await prisma.fgLocation.upsert({ where: { branchId_name: { branchId, name } }, update: {}, create: { branchId, name, kind } });
  }

  // Suppliers.
  for (const s of [{ name: 'Shenzhen Compal Components Co.', country: 'China', currency: 'USD', paymentTerms: '30% deposit, 70% before shipment', leadTimeDays: 45 }, { name: 'Intel Corporation (via distributor)', country: 'Singapore', currency: 'USD', paymentTerms: 'Net 30', leadTimeDays: 30 }, { name: 'Lagos Packaging Industries', country: 'Nigeria', currency: 'NGN', paymentTerms: 'Net 14', leadTimeDays: 7 }]) {
    await prisma.supplier.upsert({ where: { organisationId_name: { organisationId, name: s.name } }, update: {}, create: { organisationId, ...s, createdById: userId } });
  }

  // Price lists: retail and dealer tier 1, active from the start of the year.
  const year = new Date().getFullYear();
  for (const [number, name, channel, tier, key] of [[`PL-${year}-000001`, 'Retail price list', 'RETAIL', null, 'retail'], [`PL-${year}-000002`, 'Dealer price list — Tier 1', 'DEALER', 'TIER_1', 'dealer']] as const) {
    const list = await prisma.priceList.upsert({ where: { number }, update: {}, create: { organisationId, number, name, channel, tier, effectiveFrom: new Date(`${year}-01-01T00:00:00.000Z`), status: 'ACTIVE', createdById: userId, approvedById: userId, approvedAt: new Date() } });
    for (const p of PRODUCTS) {
      const product = await prisma.product.findUniqueOrThrow({ where: { organisationId_sku: { organisationId, sku: p.sku } }, select: { id: true } });
      const configs = p.configs ?? [{ code: 'STD', retail: p.retail, dealer: p.dealer }];
      for (const c of configs) {
        const configurationId = configIds.get(`${p.sku}/${c.code}`)!;
        const existing = await prisma.priceListItem.findFirst({ where: { priceListId: list.id, productId: product.id, configurationId, minQuantity: 1 } });
        if (!existing) await prisma.priceListItem.create({ data: { priceListId: list.id, productId: product.id, configurationId, unitPrice: key === 'retail' ? c.retail : c.dealer, minQuantity: 1 } });
      }
    }
  }
  await prisma.documentSequence.upsert({ where: { organisationId_prefix_year: { organisationId, prefix: 'PL', year } }, update: { last: 2 }, create: { organisationId, prefix: 'PL', year, last: 2 } });
  console.log(`Seeded the Zinox catalogue: ${PRODUCTS.length} products, ${PARTS.length} component parts, software, checklists, locations, suppliers and two price lists.`);
}
