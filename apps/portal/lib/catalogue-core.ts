/**
 * Catalogue rules that need no database: SKU and configuration-code checks,
 * the product families and their labels, and the bill-of-materials cost
 * roll-up. Relative imports only (unit-tested without Prisma).
 */

export type ProductFamilyCode =
  | 'LAPTOP' | 'DESKTOP' | 'ALL_IN_ONE' | 'TABLET' | 'MONITOR' | 'SMART_BOARD' | 'SERVER'
  | 'INVERTER' | 'BATTERY' | 'SOLAR_PANEL' | 'SOLAR_KIT'
  | 'GENERATOR' | 'TELEVISION' | 'FAN' | 'STABILISER' | 'AIR_CONDITIONER' | 'REFRIGERATOR' | 'MICROWAVE'
  | 'ACCESSORY' | 'OTHER';

export type SubBrandCode = 'ZINOX' | 'IPOWER' | 'ITEC';
export type ProductSourceCode = 'ASSEMBLED' | 'FINISHED_IMPORT' | 'KIT';

export const FAMILY_LABEL: Record<ProductFamilyCode, string> = {
  LAPTOP: 'Laptops & notebooks', DESKTOP: 'Desktops', ALL_IN_ONE: 'All-in-ones', TABLET: 'Tablets', MONITOR: 'Monitors', SMART_BOARD: 'Smart boards', SERVER: 'Servers',
  INVERTER: 'Inverters', BATTERY: 'Batteries', SOLAR_PANEL: 'Solar panels', SOLAR_KIT: 'Solar kits',
  GENERATOR: 'Generators', TELEVISION: 'Televisions', FAN: 'Fans', STABILISER: 'Stabilisers', AIR_CONDITIONER: 'Air conditioners', REFRIGERATOR: 'Refrigerators', MICROWAVE: 'Microwaves',
  ACCESSORY: 'Accessories', OTHER: 'Other',
};
export const FAMILIES = Object.keys(FAMILY_LABEL) as ProductFamilyCode[];

export const SUB_BRAND_LABEL: Record<SubBrandCode, string> = { ZINOX: 'Zinox', IPOWER: 'iPower', ITEC: 'iTEC' };
export const SOURCE_LABEL: Record<ProductSourceCode, string> = { ASSEMBLED: 'Assembled on the line', FINISHED_IMPORT: 'Bought finished', KIT: 'Kit assembled from finished products' };

/** The sub-brand each family normally sells under (a default for the new-product form). */
export function defaultSubBrand(family: ProductFamilyCode): SubBrandCode {
  if (['INVERTER', 'BATTERY', 'SOLAR_PANEL', 'SOLAR_KIT'].includes(family)) return 'IPOWER';
  if (['GENERATOR', 'TELEVISION', 'FAN', 'STABILISER', 'AIR_CONDITIONER', 'REFRIGERATOR', 'MICROWAVE'].includes(family)) return 'ITEC';
  return 'ZINOX';
}

/** The line stations a BOM line can be fitted at (shown on the traveller). */
export const STATIONS = ['ASSEMBLY', 'SOFTWARE', 'PACKING'] as const;
export type Station = (typeof STATIONS)[number];
export const STATION_LABEL: Record<Station, string> = { ASSEMBLY: 'Assembly', SOFTWARE: 'Software', PACKING: 'Packing' };

/** Upper-case letters, digits and dashes; 3–40 characters; no leading, trailing or doubled dash. */
export const SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export function normaliseSku(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '-');
}

export function isValidSku(sku: string): boolean {
  return sku.length >= 3 && sku.length <= 40 && SKU_PATTERN.test(sku);
}

/** Why a SKU is refused, in plain words (null when it is fine). */
export function skuProblem(sku: string): string | null {
  if (!sku) return 'Enter a SKU.';
  if (sku.length < 3) return 'A SKU needs at least 3 characters.';
  if (sku.length > 40) return 'A SKU can have at most 40 characters.';
  if (!SKU_PATTERN.test(sku)) return 'A SKU uses capital letters, digits and single dashes only (e.g. ZNX-PP2-I5).';
  return null;
}

/** A configuration code is the SKU suffix: 1–20 characters of the same alphabet. */
export function isValidConfigurationCode(code: string): boolean {
  return code.length >= 1 && code.length <= 20 && SKU_PATTERN.test(code);
}

export function configurationCodeProblem(code: string): string | null {
  if (!code) return 'Enter a configuration code (e.g. 16GB-512).';
  if (code.length > 20) return 'A configuration code can have at most 20 characters.';
  if (!SKU_PATTERN.test(code)) return 'A configuration code uses capital letters, digits and single dashes only.';
  return null;
}

/** The full SKU a configuration sells under. */
export function configurationSku(productSku: string, code: string): string {
  return `${productSku}-${code}`;
}

export type BomCostLine = { quantity: number; unitCost: number | null; isOptional?: boolean };

/**
 * Cost of one unit from its BOM: each line's quantity × the part's latest
 * goods-receipt cost. Parts never received (no cost) count as 0 and are
 * reported so the figure is never mistaken for complete.
 */
export function bomCostRollUp(lines: BomCostLine[]): { total: number; priced: number; unpriced: number; complete: boolean } {
  let total = 0;
  let priced = 0;
  let unpriced = 0;
  for (const l of lines) {
    if (l.isOptional) continue;
    if (l.unitCost === null || !Number.isFinite(l.unitCost)) { unpriced += 1; continue; }
    priced += 1;
    total += l.quantity * l.unitCost;
  }
  return { total: Math.round(total * 100) / 100, priced, unpriced, complete: unpriced === 0 };
}

/** Free-form "key: value" lines typed on a form → the specs JSON kept on the product. */
export function parseSpecLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const at = line.indexOf(':');
    if (at <= 0) { out[line.slice(0, 60)] = ''; continue; }
    const key = line.slice(0, at).trim().slice(0, 60);
    const value = line.slice(at + 1).trim().slice(0, 200);
    if (key) out[key] = value;
  }
  return out;
}

export function specLines(specs: unknown): string {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return '';
  return Object.entries(specs as Record<string, unknown>).map(([k, v]) => (v === '' || v === null || v === undefined ? k : `${k}: ${String(v)}`)).join('\n');
}
