import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, easeInOutCubic, wrapIndex, coverScale, normalizeOptions, EFFECTS } from '../src/liquid-transitions.js';

test('clamp and wrapIndex', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(wrapIndex(4, 4), 0);
  assert.equal(wrapIndex(-1, 4), 3);
  assert.equal(wrapIndex(-9, 4), 3);
});

test('easing starts at 0, ends at 1, is symmetric around the middle', () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);
  assert.equal(easeInOutCubic(0.5), 0.5);
  assert.ok(easeInOutCubic(0.25) < 0.25, 'slow start');
  assert.ok(easeInOutCubic(0.75) > 0.75, 'slow end');
  for (let t = 0; t < 1; t += 0.05) assert.ok(easeInOutCubic(t + 0.05) >= easeInOutCubic(t), 'monotonic');
});

test('coverScale behaves like object-fit: cover', () => {
  assert.deepEqual(coverScale(1000, 1000, 500, 500), [1, 1]);
  const [sx, sy] = coverScale(2000, 1000, 500, 500); // wide image in a square box: crop the sides
  assert.equal(sy, 1);
  assert.equal(sx, 0.5);
  const [tx, ty] = coverScale(1000, 2000, 500, 500); // tall image in a square box: crop top and bottom
  assert.equal(tx, 1);
  assert.equal(ty, 0.5);
  const [wx, wy] = coverScale(1000, 1000, 1000, 500); // wide box: crop top and bottom
  assert.equal(wx, 1);
  assert.equal(wy, 0.5);
});

test('normalizeOptions validates and clamps', () => {
  assert.throws(() => normalizeOptions({ images: ['a.jpg'] }), /at least two/);
  assert.throws(() => normalizeOptions({ images: ['a', 'b'], effect: 'nope' }), /effect/);
  assert.throws(() => normalizeOptions({ images: ['a', 'b'], trigger: 'tap' }), /trigger/);
  const o = normalizeOptions({ images: ['a', 'b', 'c'], duration: 99, intensity: -3, start: 7 });
  assert.equal(o.duration, 10);
  assert.equal(o.intensity, 0);
  assert.equal(o.start, 1);
  assert.equal(o.effect, 'liquid');
  assert.deepEqual(EFFECTS, ['liquid', 'ripple', 'dissolve']);
});
