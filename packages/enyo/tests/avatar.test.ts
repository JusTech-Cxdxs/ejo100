import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mouthShape, SMILE, syllable } from '../src/ui/avatar-mouth';

/** The y values of a path's points (every second number). */
const ys = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 1);

test('avatar mouth: closed lips show no inside of the mouth, no teeth, no tongue', () => {
  for (const smile of Object.values(SMILE)) {
    const m = mouthShape(0, smile);
    assert.equal(m.teethH, 0);
    assert.equal(m.tongueRx, 0);
    // The inner mouth's top edge (a quadratic) and bottom edge (a cubic) meet in the middle: no gap.
    const [cy = 0, q = 0, , c = 0] = ys(m.inner);
    const topMid = (cy + q) / 2;
    const bottomMid = 0.25 * cy + 0.75 * c;
    assert.ok(Math.abs(topMid - bottomMid) < 0.02, `closed at smile ${smile}`);
  }
});

test('avatar mouth: opening drops the lower lip and shows teeth, then the tongue', () => {
  const half = mouthShape(0.5, 0.35);
  const wide = mouthShape(1, 0.35);
  assert.ok(half.teethH > 0);
  assert.ok(Math.max(...ys(wide.lower)) > Math.max(...ys(half.lower)), 'the jaw drops further when wider');
  assert.ok(wide.tongueRx > 0 && wide.tongueRy > 0);
  // Values are clamped.
  assert.deepEqual(mouthShape(2, 0.35), mouthShape(1, 0.35));
  assert.deepEqual(mouthShape(-1, 0.35), mouthShape(0, 0.35));
});

test('avatar mouth: a syllable rhythm stays within 0..1 and both opens and closes', () => {
  const values = Array.from({ length: 400 }, (_, i) => syllable(i / 100));
  assert.ok(values.every((v) => v >= 0 && v <= 1));
  assert.ok(Math.min(...values) < 0.15 && Math.max(...values) > 0.85);
});

test('avatar: only the speaking mood animates the mouth; blinks and glances stop with reduced motion', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'src', 'ui', 'EnyoAvatar.tsx'), 'utf8');
  assert.match(src, /if \(mood !== 'speaking'\) \{ apply\(mouthShape\(0, smile\)\); return; \}/);
  assert.match(src, /if \(!el \|\| reducedMotion\(\)\) return;/);
  assert.match(src, /\.enyo-av \.av-lid\{transform:scaleY\(0\)!important\}/);
  assert.match(src, /aria-hidden="true"/);
});
