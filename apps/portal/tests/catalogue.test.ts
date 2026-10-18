/** Catalogue rules: SKUs, configuration codes, the BOM cost roll-up, spec lines. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bomCostRollUp, configurationCodeProblem, configurationSku, defaultSubBrand, FAMILIES, FAMILY_LABEL, isValidConfigurationCode, isValidSku,
  normaliseSku, parseSpecLines, skuProblem, specLines,
} from '../lib/catalogue-core';

test('a SKU is capital letters, digits and single dashes, 3–40 characters', () => {
  for (const ok of ['ZNX-PP2-I5', 'ABC', 'ZPAD-X9-PRO-2026', 'A1B2C3', 'X'.repeat(40)]) assert.ok(isValidSku(ok), ok);
  for (const bad of ['', 'AB', 'znx-pp2', 'ZNX PP2', '-ZNX', 'ZNX-', 'ZNX--PP2', 'ZNX_PP2', 'ZNX.PP2', 'X'.repeat(41)]) assert.ok(!isValidSku(bad), bad);
});

test('normaliseSku upper-cases and turns spaces into dashes', () => {
  assert.equal(normaliseSku('  znx pp2 i5 '), 'ZNX-PP2-I5');
  assert.equal(normaliseSku('zpad-x9'), 'ZPAD-X9');
});

test('skuProblem says why in plain words', () => {
  assert.equal(skuProblem('ZNX-PP2'), null);
  assert.match(skuProblem('') ?? '', /Enter a SKU/);
  assert.match(skuProblem('AB') ?? '', /at least 3/);
  assert.match(skuProblem('x'.repeat(41).toUpperCase()) ?? '', /at most 40/);
  assert.match(skuProblem('ZNX PP2') ?? '', /capital letters, digits and single dashes/);
});

test('a configuration code is the SKU suffix: 1–20 characters of the same alphabet', () => {
  for (const ok of ['16GB-512', 'I5', 'W11P-NGN', 'A'.repeat(20)]) assert.ok(isValidConfigurationCode(ok), ok);
  for (const bad of ['', '16gb', '16 GB', '-16', 'A'.repeat(21)]) assert.ok(!isValidConfigurationCode(bad), bad);
  assert.equal(configurationCodeProblem('16GB-512'), null);
  assert.match(configurationCodeProblem('') ?? '', /Enter a configuration code/);
  assert.match(configurationCodeProblem('A'.repeat(21)) ?? '', /at most 20/);
  assert.equal(configurationSku('ZNX-PP2', '16GB-512'), 'ZNX-PP2-16GB-512');
});

test('the BOM cost roll-up multiplies quantity by the latest receipt cost, counts unpriced parts as 0 and says so', () => {
  const r = bomCostRollUp([
    { quantity: 1, unitCost: 120000 },
    { quantity: 2, unitCost: 15500.5 },
    { quantity: 1, unitCost: null },
    { quantity: 4, unitCost: 250, isOptional: true },
  ]);
  assert.equal(r.total, 151001);
  assert.equal(r.priced, 2);
  assert.equal(r.unpriced, 1);
  assert.equal(r.complete, false);
  const full = bomCostRollUp([{ quantity: 3, unitCost: 10.333 }]);
  assert.equal(full.total, 31);
  assert.equal(full.complete, true);
  assert.deepEqual(bomCostRollUp([]), { total: 0, priced: 0, unpriced: 0, complete: true });
});

test('every family has a label, a default sub-brand and keeps iPower / iTEC where they belong', () => {
  assert.equal(FAMILIES.length, 20);
  for (const f of FAMILIES) assert.ok(FAMILY_LABEL[f].length > 2, f);
  assert.equal(defaultSubBrand('LAPTOP'), 'ZINOX');
  assert.equal(defaultSubBrand('INVERTER'), 'IPOWER');
  assert.equal(defaultSubBrand('SOLAR_KIT'), 'IPOWER');
  assert.equal(defaultSubBrand('GENERATOR'), 'ITEC');
  assert.equal(defaultSubBrand('TELEVISION'), 'ITEC');
  assert.equal(defaultSubBrand('ACCESSORY'), 'ZINOX');
});

test('spec lines round-trip through the form', () => {
  const specs = parseSpecLines('Processor: Intel i5-1235U\nDisplay: 14.1" FHD touch\n\nKeyboard: Naira-sign layout\nBare line');
  assert.deepEqual(specs, { Processor: 'Intel i5-1235U', Display: '14.1" FHD touch', Keyboard: 'Naira-sign layout', 'Bare line': '' });
  assert.equal(specLines(specs), 'Processor: Intel i5-1235U\nDisplay: 14.1" FHD touch\nKeyboard: Naira-sign layout\nBare line');
  assert.equal(specLines(null), '');
  assert.equal(specLines([1, 2]), '');
});
