"use strict";
/**
 * Catalogue rules that need no database: SKU and configuration-code checks,
 * the product families and their labels, and the bill-of-materials cost
 * roll-up. Relative imports only (unit-tested without Prisma).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SKU_PATTERN = exports.STATION_LABEL = exports.STATIONS = exports.SOURCE_LABEL = exports.SUB_BRAND_LABEL = exports.FAMILIES = exports.FAMILY_LABEL = void 0;
exports.defaultSubBrand = defaultSubBrand;
exports.normaliseSku = normaliseSku;
exports.isValidSku = isValidSku;
exports.skuProblem = skuProblem;
exports.isValidConfigurationCode = isValidConfigurationCode;
exports.configurationCodeProblem = configurationCodeProblem;
exports.configurationSku = configurationSku;
exports.bomCostRollUp = bomCostRollUp;
exports.parseSpecLines = parseSpecLines;
exports.specLines = specLines;
exports.FAMILY_LABEL = {
    LAPTOP: 'Laptops & notebooks', DESKTOP: 'Desktops', ALL_IN_ONE: 'All-in-ones', TABLET: 'Tablets', MONITOR: 'Monitors', SMART_BOARD: 'Smart boards', SERVER: 'Servers',
    INVERTER: 'Inverters', BATTERY: 'Batteries', SOLAR_PANEL: 'Solar panels', SOLAR_KIT: 'Solar kits',
    GENERATOR: 'Generators', TELEVISION: 'Televisions', FAN: 'Fans', STABILISER: 'Stabilisers', AIR_CONDITIONER: 'Air conditioners', REFRIGERATOR: 'Refrigerators', MICROWAVE: 'Microwaves',
    ACCESSORY: 'Accessories', OTHER: 'Other',
};
exports.FAMILIES = Object.keys(exports.FAMILY_LABEL);
exports.SUB_BRAND_LABEL = { ZINOX: 'Zinox', IPOWER: 'iPower', ITEC: 'iTEC' };
exports.SOURCE_LABEL = { ASSEMBLED: 'Assembled on the line', FINISHED_IMPORT: 'Bought finished', KIT: 'Kit assembled from finished products' };
/** The sub-brand each family normally sells under (a default for the new-product form). */
function defaultSubBrand(family) {
    if (['INVERTER', 'BATTERY', 'SOLAR_PANEL', 'SOLAR_KIT'].includes(family))
        return 'IPOWER';
    if (['GENERATOR', 'TELEVISION', 'FAN', 'STABILISER', 'AIR_CONDITIONER', 'REFRIGERATOR', 'MICROWAVE'].includes(family))
        return 'ITEC';
    return 'ZINOX';
}
/** The line stations a BOM line can be fitted at (shown on the traveller). */
exports.STATIONS = ['ASSEMBLY', 'SOFTWARE', 'PACKING'];
exports.STATION_LABEL = { ASSEMBLY: 'Assembly', SOFTWARE: 'Software', PACKING: 'Packing' };
/** Upper-case letters, digits and dashes; 3–40 characters; no leading, trailing or doubled dash. */
exports.SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
function normaliseSku(raw) {
    return raw.trim().toUpperCase().replace(/\s+/g, '-');
}
function isValidSku(sku) {
    return sku.length >= 3 && sku.length <= 40 && exports.SKU_PATTERN.test(sku);
}
/** Why a SKU is refused, in plain words (null when it is fine). */
function skuProblem(sku) {
    if (!sku)
        return 'Enter a SKU.';
    if (sku.length < 3)
        return 'A SKU needs at least 3 characters.';
    if (sku.length > 40)
        return 'A SKU can have at most 40 characters.';
    if (!exports.SKU_PATTERN.test(sku))
        return 'A SKU uses capital letters, digits and single dashes only (e.g. ZNX-PP2-I5).';
    return null;
}
/** A configuration code is the SKU suffix: 1–20 characters of the same alphabet. */
function isValidConfigurationCode(code) {
    return code.length >= 1 && code.length <= 20 && exports.SKU_PATTERN.test(code);
}
function configurationCodeProblem(code) {
    if (!code)
        return 'Enter a configuration code (e.g. 16GB-512).';
    if (code.length > 20)
        return 'A configuration code can have at most 20 characters.';
    if (!exports.SKU_PATTERN.test(code))
        return 'A configuration code uses capital letters, digits and single dashes only.';
    return null;
}
/** The full SKU a configuration sells under. */
function configurationSku(productSku, code) {
    return `${productSku}-${code}`;
}
/**
 * Cost of one unit from its BOM: each line's quantity × the part's latest
 * goods-receipt cost. Parts never received (no cost) count as 0 and are
 * reported so the figure is never mistaken for complete.
 */
function bomCostRollUp(lines) {
    let total = 0;
    let priced = 0;
    let unpriced = 0;
    for (const l of lines) {
        if (l.isOptional)
            continue;
        if (l.unitCost === null || !Number.isFinite(l.unitCost)) {
            unpriced += 1;
            continue;
        }
        priced += 1;
        total += l.quantity * l.unitCost;
    }
    return { total: Math.round(total * 100) / 100, priced, unpriced, complete: unpriced === 0 };
}
/** Free-form "key: value" lines typed on a form → the specs JSON kept on the product. */
function parseSpecLines(text) {
    const out = {};
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line)
            continue;
        const at = line.indexOf(':');
        if (at <= 0) {
            out[line.slice(0, 60)] = '';
            continue;
        }
        const key = line.slice(0, at).trim().slice(0, 60);
        const value = line.slice(at + 1).trim().slice(0, 200);
        if (key)
            out[key] = value;
    }
    return out;
}
function specLines(specs) {
    if (!specs || typeof specs !== 'object' || Array.isArray(specs))
        return '';
    return Object.entries(specs).map(([k, v]) => (v === '' || v === null || v === undefined ? k : `${k}: ${String(v)}`)).join('\n');
}
