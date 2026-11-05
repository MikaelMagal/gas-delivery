const test = require('node:test');
const assert = require('node:assert/strict');
const { startOfToday, distanceM } = require('../dist/utils');
test('operational day follows Brasilia instead of the host timezone', () => {
  assert.equal(startOfToday(new Date('2026-11-06T01:30:00.000Z')).toISOString(), '2026-11-05T03:00:00.000Z');
  assert.equal(startOfToday(new Date('2026-11-06T03:00:00.000Z')).toISOString(), '2026-11-06T03:00:00.000Z');
});
test('valid extreme coordinates produce finite distance and cannot bypass the radius with NaN', () => {
  assert.equal(distanceM(0, 0, 0, 0), 0);
  for (const coordinates of [[-90, -180, 90, 180], [45, 30, -45, -150]]) assert.ok(Number.isFinite(distanceM(...coordinates)));
  assert.ok(distanceM(0, 0, 0, 180) > 20000000);
});
