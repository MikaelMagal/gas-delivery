const test = require('node:test');
const assert = require('node:assert/strict');
const { operationalWindow, byOperationalStatus } = require('../dist/deliveryVisibility');

test('operational day includes old open orders and completion day, with Brasilia boundaries', () => {
  const window = operationalWindow(new Date('2026-11-07T02:59:59Z'));
  const matches = d => window.OR.some(branch => Object.entries(branch).every(([key, condition]) => {
    if (typeof condition === 'string') return d[key] === condition;
    if (condition.in) return condition.in.includes(d[key]);
    return d[key] != null && d[key] >= condition.gte && d[key] < condition.lt;
  }));
  const old = new Date('2026-11-01T12:00:00Z');
  for (const status of ['PENDING', 'EN_ROUTE']) assert.equal(matches({ status, createdAt: old }), true);
  const delivered = time => ({ status: 'DELIVERED', createdAt: old, deliveredAt: new Date(time) });
  assert.equal(matches(delivered('2026-11-06T03:00:00Z')), true);
  assert.equal(matches(delivered('2026-11-07T02:59:59Z')), true);
  assert.equal(matches(delivered('2026-11-06T02:59:59Z')), false);
  assert.equal(matches(delivered('2026-11-07T03:00:00Z')), false);
  assert.equal(matches({ status: 'DELIVERED', createdAt: new Date('2026-11-06T12:00:00Z'), deliveredAt: old }), false);
  assert.equal(matches({ status: 'CANCELED', createdAt: old }), false);
  assert.equal(matches({ status: 'CANCELED', createdAt: new Date('2026-11-06T12:00:00Z') }), true);
  assert.equal(operationalWindow(new Date('2026-11-07T03:00:00Z')).OR[1].deliveredAt.gte.toISOString(), '2026-11-07T03:00:00.000Z');
});

test('admin priority preserves existing order within each status', () => {
  const rows = ['DELIVERED', 'PENDING', 'CANCELED', 'EN_ROUTE', 'PENDING', 'EN_ROUTE'].map((status, id) => ({ status, id }));
  assert.deepEqual(rows.sort(byOperationalStatus).map(d => d.id), [3, 5, 1, 4, 0, 2]);
});
