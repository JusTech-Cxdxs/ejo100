/**
 * The vehicle label: one label per vehicle, tied to its VIN, carrying a QR
 * code (opens the vehicle's page) and a Code 128 barcode of the VIN (for
 * handheld scanners). The codes are checked by reading them back: the QR
 * with an independent decoder, the barcode against an independent encoder's
 * output and by decoding its bars.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import jsQR from 'jsqr';
import { CODE128_PATTERNS, CODE128_QUIET, code128Bars, encodeCode128B } from '../lib/barcode/code128';
import { qrMatrix, qrSvgPath, QR_QUIET } from '../lib/barcode/qr';
import { isChassisLike, isVin, normaliseVin, vehiclePagePath, vehicleScanPath, vinCheckDigitOk, vinFromScan } from '../lib/vin';
import { buildLife, currentStage, lifeStageOf, pdiVerdict, resultTone } from '../lib/vehicle-life';
import { PERMISSIONS, ROLE_GRANTS } from '../lib/authz/catalogue';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

test('VINs: matched however they are typed; 17 characters without I, O or Q; the check digit only advises', () => {
  assert.equal(normaliseVin(' jalfr-r90l m7000123 '), 'JALFRR90LM7000123');
  assert.ok(isVin('1M8GDM9AXKP042788'));
  assert.ok(!isVin('1M8GDM9AXKP04278'), '16 characters');
  assert.ok(!isVin('1M8GDM9AXKP04278O'), 'O is never in a VIN');
  assert.equal(vinCheckDigitOk('1M8GDM9AXKP042788'), true, 'the standard example');
  assert.equal(vinCheckDigitOk('1M8GDM9A1KP042788'), false);
  assert.equal(vinCheckDigitOk('ABC123'), null);
  assert.ok(isChassisLike('NQR75-0012345'), 'older chassis numbers are kept too');
  assert.ok(!isChassisLike('ab'), 'too short');
  assert.ok(!isChassisLike('<script>'), 'never anything but letters and digits');
  // What a scanner or a phone gives back: the bare VIN, or the label's address.
  assert.equal(vinFromScan('JALFRR90LM7000123'), 'JALFRR90LM7000123');
  assert.equal(vinFromScan('https://portal.example.com/v/JALFRR90LM7000123'), 'JALFRR90LM7000123');
  assert.equal(vinFromScan('https://portal.example.com/v/jalfrr90lm7000123?x=1'), 'JALFRR90LM7000123');
  assert.equal(vinFromScan('hello world'), null);
  assert.ok(!isChassisLike('MAINTENANCE'), 'a word is never a chassis number');
  assert.equal(vehicleScanPath('jalfrr90lm7000123'), '/v/JALFRR90LM7000123');
  assert.equal(vehiclePagePath('JALFRR90LM7000123'), '/vehicles/JALFRR90LM7000123');
});

test('Code 128: the standard table, the check character, and the same bars as an independent encoder', () => {
  assert.equal(CODE128_PATTERNS.length, 107);
  CODE128_PATTERNS.forEach((p, i) => assert.equal([...p].reduce((a, b) => a + Number(b), 0), i === 106 ? 13 : 11, `pattern ${i}`));
  assert.equal(new Set(CODE128_PATTERNS).size, 107, 'every pattern is different');
  // python-barcode's Code 128 for the same text, bar by bar (1 = bar, 0 = space).
  const independent = '110100100001011011100010100011000100011011101000110001011000101110110001011101110010110010011101100100011011101011101100010111000110111011011101100011101011';
  const { widths } = encodeCode128B('JALFRR90LMN');
  assert.equal(widths.map((w, i) => (i % 2 ? '0' : '1').repeat(w)).join(''), independent);
  // Check character: Start B (104) + Σ position × value, mod 103.
  const { values } = encodeCode128B('VIN');
  assert.deepEqual(values, [104, 54, 41, 46, (104 + 54 * 1 + 41 * 2 + 46 * 3) % 103, 106]);
  assert.throws(() => encodeCode128B('ÑVIN'), /cannot hold/);
  assert.throws(() => encodeCode128B(''), /Nothing/);
});

test('Code 128: the bars read back as the VIN, with quiet zones each side', () => {
  const vin = 'JALFRR90LM7000123';
  const { bars, modules } = code128Bars(vin);
  // Rebuild the bar/space run-lengths from the drawn bars, then decode them with the table.
  const runs: number[] = [];
  let x = CODE128_QUIET;
  for (const [bx, w] of bars) { if (bx > x) runs.push(bx - x); runs.push(w); x = bx + w; }
  assert.equal(modules - x, CODE128_QUIET, 'quiet zone after the stop bar');
  assert.equal(bars[0]![0], CODE128_QUIET, 'quiet zone before the start');
  const lookup = new Map(CODE128_PATTERNS.map((p, i) => [p, i]));
  const decoded: number[] = [];
  for (let i = 0; i < runs.length;) {
    const take = runs.length - i === 7 ? 7 : 6;
    decoded.push(lookup.get(runs.slice(i, i + take).join(''))!);
    i += take;
  }
  assert.equal(decoded[0], 104, 'Start B');
  assert.equal(decoded.at(-1), 106, 'Stop');
  assert.equal(String.fromCharCode(...decoded.slice(1, -2).map((v) => v + 32)), vin);
  const check = decoded.at(-2)!;
  assert.equal(check, decoded.slice(1, -2).reduce((s, v, i) => s + v * (i + 1), 104) % 103);
});

test('QR: an independent decoder reads the vehicle’s address back from the drawn code', () => {
  const url = 'https://portal.kewalram.example/v/JALFRR90LM7000123';
  const m = qrMatrix(url);
  const scale = 6;
  const side = (m.size + 2 * QR_QUIET) * scale;
  const px = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) {
    if (!m.dark(r, c)) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = (((r + QR_QUIET) * scale + dy) * side + (c + QR_QUIET) * scale + dx) * 4;
      px[i] = 0; px[i + 1] = 0; px[i + 2] = 0;
    }
  }
  const read = jsQR(px, side, side);
  assert.ok(read, 'the code scans');
  assert.equal(read!.data, url);
  assert.ok(m.version <= 4, `small enough to scan at arm’s length (version ${m.version})`);
  const svg = qrSvgPath(url);
  assert.equal(svg.modules, m.size + 2 * QR_QUIET);
  assert.match(svg.path, /^M\d+ \d+h\d+v1h-\d+z/);
});

test('life stages: register rows land in the right stage; failures stay visible until passed', () => {
  assert.equal(lifeStageOf('PRODUCTION', 'Kit arrival — case check'), 'kit');
  assert.equal(lifeStageOf('QC', 'Incoming kit QC'), 'kit');
  assert.equal(lifeStageOf('PRODUCTION', 'Trim line 2'), 'station');
  assert.equal(lifeStageOf('QC', 'Final QA gate'), 'qa');
  assert.equal(lifeStageOf('QC', 'Water test'), 'qa');
  assert.equal(lifeStageOf('PDI', 'Lights and horn'), 'pdi');
  assert.equal(lifeStageOf('PRODUCTION', 'Moved to yard B'), 'yard');
  assert.equal(lifeStageOf('PRODUCTION', 'Delivered to dealer'), 'sale');
  assert.equal(resultTone('ok'), 'pass');
  assert.equal(resultTone('NG'), 'fail');
  assert.equal(resultTone('Rework'), 'rework');
  assert.equal(resultTone('On hold'), 'open');
  assert.equal(resultTone('see notes'), 'other');
  assert.equal(resultTone(''), null);
  const rec = (id: string, kind: string, date: string, stage: string, result: string) => ({ id, kind, date, stage, result, reference: null, notes: null, inspector: 'A. Inspector' });
  const stages = buildLife({
    records: [
      rec('1', 'PRODUCTION', '2026-09-01', 'Kit arrival', 'PASS'),
      rec('2', 'PRODUCTION', '2026-09-03', 'Chassis line', 'PASS'),
      rec('3', 'QC', '2026-09-05', 'Final QA gate', 'FAIL'),
      rec('4', 'QC', '2026-09-06', 'Final QA gate', 'PASS'),
      rec('5', 'PDI', '2026-09-08', 'Brakes', 'PASS'),
      rec('6', 'PDI', '2026-09-08', 'Electrics', 'FAIL'),
    ],
    sale: { date: '2026-09-20', label: 'Registered to its customer' },
    warrantyStart: { date: '2026-09-20', label: 'Vehicle warranty starts' },
  });
  const by = Object.fromEntries(stages.map((s) => [s.key, s]));
  assert.deepEqual(stages.map((s) => s.key), ['kit', 'station', 'qa', 'pdi', 'yard', 'sale']);
  assert.equal(by.qa!.state, 'done', 'a failure passed later is done');
  assert.equal(by.pdi!.state, 'issue', 'an electrics failure not passed since');
  assert.equal(by.yard!.state, 'none');
  assert.equal(by.sale!.entries.length, 2);
  assert.equal(currentStage(stages)!.key, 'sale');
  assert.equal(pdiVerdict(stages).state, 'not-passed');
  const fixed = buildLife({ records: [rec('5', 'PDI', '2026-09-08', 'Brakes', 'PASS'), rec('6', 'PDI', '2026-09-08', 'Electrics', 'FAIL'), rec('7', 'PDI', '2026-09-09', 'Electrics', 'OK')] });
  assert.deepEqual({ state: pdiVerdict(fixed).state, date: pdiVerdict(fixed).date }, { state: 'passed', date: '2026-09-09' });
  // A word EJO does not recognise as a pass never certifies a vehicle.
  assert.equal(pdiVerdict(buildLife({ records: [rec('8', 'PDI', '2026-09-09', 'Body', 'see notes')] })).state, 'not-passed');
  assert.equal(pdiVerdict(buildLife({ records: [] })).state, 'not-recorded');
});

test('printing labels is its own permission; the pages, search and scan address are wired', () => {
  assert.ok(PERMISSIONS['vehicles.label.print']);
  assert.ok(ROLE_GRANTS['administrator']!['vehicles.label.print']);
  assert.ok(ROLE_GRANTS['workshop-manager']!['vehicles.label.print']);
  assert.ok(!ROLE_GRANTS['technician']?.['vehicles.label.print'], 'technicians do not print labels');
  assert.ok(!ROLE_GRANTS['security-officer']?.['vehicles.label.print'], 'the gate scans, it does not print');
  const actions = read('lib/actions/vehicle-passport.ts');
  assert.match(actions, /export async function recordVehiclePrint[\s\S]{0,300}authorize\('vehicles\.label\.print'/);
  assert.match(actions, /refuseDuringAssist\('recordVehiclePrint'\)/);
  assert.match(actions, /That is not a vehicle EJO knows/);
  assert.match(actions, /customer: fence/);
  // The certificate the customer receives names no staff.
  const cert = read('app/print/pdi-certificate/[vin]/page.tsx');
  assert.doesNotMatch(cert, /inspector/);
  assert.match(cert, /NOT A CERTIFICATE/);
  // A handheld scanner types the VIN and presses Enter, often before results arrive.
  assert.match(read('components/GlobalSearch.tsx'), /e\.key === 'Enter' && isVin\(q\)/);
  assert.match(read('lib/actions/search.ts'), /group: 'Vehicle \(VIN\)'/);
  assert.match(read('app/(app)/v/[vin]/page.tsx'), /redirect\(vehiclePagePath\(v\)\)/);
});
