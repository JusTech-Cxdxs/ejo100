"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/** Catalogue rules: SKUs, configuration codes, the BOM cost roll-up, spec lines. */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const catalogue_core_1 = require("../lib/catalogue-core");
(0, node_test_1.test)('a SKU is capital letters, digits and single dashes, 3–40 characters', () => {
    for (const ok of ['ZNX-PP2-I5', 'ABC', 'ZPAD-X9-PRO-2026', 'A1B2C3', 'X'.repeat(40)])
        strict_1.default.ok((0, catalogue_core_1.isValidSku)(ok), ok);
    for (const bad of ['', 'AB', 'znx-pp2', 'ZNX PP2', '-ZNX', 'ZNX-', 'ZNX--PP2', 'ZNX_PP2', 'ZNX.PP2', 'X'.repeat(41)])
        strict_1.default.ok(!(0, catalogue_core_1.isValidSku)(bad), bad);
});
(0, node_test_1.test)('normaliseSku upper-cases and turns spaces into dashes', () => {
    strict_1.default.equal((0, catalogue_core_1.normaliseSku)('  znx pp2 i5 '), 'ZNX-PP2-I5');
    strict_1.default.equal((0, catalogue_core_1.normaliseSku)('zpad-x9'), 'ZPAD-X9');
});
(0, node_test_1.test)('skuProblem says why in plain words', () => {
    strict_1.default.equal((0, catalogue_core_1.skuProblem)('ZNX-PP2'), null);
    strict_1.default.match((0, catalogue_core_1.skuProblem)('') ?? '', /Enter a SKU/);
    strict_1.default.match((0, catalogue_core_1.skuProblem)('AB') ?? '', /at least 3/);
    strict_1.default.match((0, catalogue_core_1.skuProblem)('x'.repeat(41).toUpperCase()) ?? '', /at most 40/);
    strict_1.default.match((0, catalogue_core_1.skuProblem)('ZNX PP2') ?? '', /capital letters, digits and single dashes/);
});
(0, node_test_1.test)('a configuration code is the SKU suffix: 1–20 characters of the same alphabet', () => {
    for (const ok of ['16GB-512', 'I5', 'W11P-NGN', 'A'.repeat(20)])
        strict_1.default.ok((0, catalogue_core_1.isValidConfigurationCode)(ok), ok);
    for (const bad of ['', '16gb', '16 GB', '-16', 'A'.repeat(21)])
        strict_1.default.ok(!(0, catalogue_core_1.isValidConfigurationCode)(bad), bad);
    strict_1.default.equal((0, catalogue_core_1.configurationCodeProblem)('16GB-512'), null);
    strict_1.default.match((0, catalogue_core_1.configurationCodeProblem)('') ?? '', /Enter a configuration code/);
    strict_1.default.match((0, catalogue_core_1.configurationCodeProblem)('A'.repeat(21)) ?? '', /at most 20/);
    strict_1.default.equal((0, catalogue_core_1.configurationSku)('ZNX-PP2', '16GB-512'), 'ZNX-PP2-16GB-512');
});
(0, node_test_1.test)('the BOM cost roll-up multiplies quantity by the latest receipt cost, counts unpriced parts as 0 and says so', () => {
    const r = (0, catalogue_core_1.bomCostRollUp)([
        { quantity: 1, unitCost: 120000 },
        { quantity: 2, unitCost: 15500.5 },
        { quantity: 1, unitCost: null },
        { quantity: 4, unitCost: 250, isOptional: true },
    ]);
    strict_1.default.equal(r.total, 151001);
    strict_1.default.equal(r.priced, 2);
    strict_1.default.equal(r.unpriced, 1);
    strict_1.default.equal(r.complete, false);
    const full = (0, catalogue_core_1.bomCostRollUp)([{ quantity: 3, unitCost: 10.333 }]);
    strict_1.default.equal(full.total, 31);
    strict_1.default.equal(full.complete, true);
    strict_1.default.deepEqual((0, catalogue_core_1.bomCostRollUp)([]), { total: 0, priced: 0, unpriced: 0, complete: true });
});
(0, node_test_1.test)('every family has a label, a default sub-brand and keeps iPower / iTEC where they belong', () => {
    strict_1.default.equal(catalogue_core_1.FAMILIES.length, 20);
    for (const f of catalogue_core_1.FAMILIES)
        strict_1.default.ok(catalogue_core_1.FAMILY_LABEL[f].length > 2, f);
    strict_1.default.equal((0, catalogue_core_1.defaultSubBrand)('LAPTOP'), 'ZINOX');
    strict_1.default.equal((0, catalogue_core_1.defaultSubBrand)('INVERTER'), 'IPOWER');
    strict_1.default.equal((0, catalogue_core_1.defaultSubBrand)('SOLAR_KIT'), 'IPOWER');
    strict_1.default.equal((0, catalogue_core_1.defaultSubBrand)('GENERATOR'), 'ITEC');
    strict_1.default.equal((0, catalogue_core_1.defaultSubBrand)('TELEVISION'), 'ITEC');
    strict_1.default.equal((0, catalogue_core_1.defaultSubBrand)('ACCESSORY'), 'ZINOX');
});
(0, node_test_1.test)('spec lines round-trip through the form', () => {
    const specs = (0, catalogue_core_1.parseSpecLines)('Processor: Intel i5-1235U\nDisplay: 14.1" FHD touch\n\nKeyboard: Naira-sign layout\nBare line');
    strict_1.default.deepEqual(specs, { Processor: 'Intel i5-1235U', Display: '14.1" FHD touch', Keyboard: 'Naira-sign layout', 'Bare line': '' });
    strict_1.default.equal((0, catalogue_core_1.specLines)(specs), 'Processor: Intel i5-1235U\nDisplay: 14.1" FHD touch\nKeyboard: Naira-sign layout\nBare line');
    strict_1.default.equal((0, catalogue_core_1.specLines)(null), '');
    strict_1.default.equal((0, catalogue_core_1.specLines)([1, 2]), '');
});
