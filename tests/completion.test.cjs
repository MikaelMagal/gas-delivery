const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const { ZodError } = require('zod');
const { prisma } = require('./helpers/companyMocks.cjs');
const { signToken } = require('../dist/auth');
const rt = require('../dist/realtime'); rt.emitToAdmins = () => {};
const { deliveries } = require('../dist/routes/deliveries');
test('confirmation: ownership, GPS, automatic next stop, no shift closure and retry idempotency', async () => {
  const user = { id: 'driver', role: 'DRIVER', active: true, passwordHash: 'hash' };
  let shiftOpen = true;
  const stops = [
    { id: 'own', driverId: 'driver', status: 'EN_ROUTE', lat: -23, lng: -46, sortOrder: 0, createdAt: '2026-11-05', },
    { id: 'later', driverId: 'driver', status: 'PENDING', lat: -23, lng: -46, sortOrder: 2, createdAt: '2026-11-05' },
    { id: 'next', driverId: 'driver', status: 'PENDING', lat: -23, lng: -46, sortOrder: 1, createdAt: '2026-11-05' },
    { id: 'other', driverId: 'another-driver', status: 'PENDING', lat: -23, lng: -46, sortOrder: -1, createdAt: '2026-11-05' },
  ];
  const delivery = stops[0];
  let writes = 0;
  prisma.user.findUnique = async ({ where }) => ({ ...user, id: where.id, role: where.id === 'admin' ? 'ADMIN' : 'DRIVER' });
  prisma.delivery.findFirst = async ({ where, orderBy }) => {
    if (where.status === 'PENDING') assert.deepEqual(orderBy, [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]);
    return stops.filter(d => d.driverId === where.driverId && (!where.id || d.id === where.id) && (!where.status || d.status === where.status)).sort((a, b) => a.sortOrder - b.sortOrder)[0] || null;
  };
  prisma.shift.findFirst = async () => shiftOpen ? { id: 'shift' } : null;
  prisma.shift.updateMany = async () => { assert.fail('Confirmation must not close the shift'); };
  prisma.delivery.updateMany = async ({ where, data }) => {
    const d = stops.find(d => d.id === where.id && d.driverId === where.driverId && d.status === where.status);
    if (!d) return { count: 0 };
    Object.assign(d, data); writes++; return { count: 1 };
  };
  prisma.delivery.findUniqueOrThrow = async ({ where }) => stops.find(d => d.id === where.id);
  prisma.$transaction = async callback => callback(prisma);
  const app = express(); app.use(express.json()); app.use('/deliveries', deliveries);
  app.use((err, req, res, next) => res.status(err instanceof ZodError ? 400 : err.status || 500).json({ error: 'invalid' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/deliveries/`;
  const token = signToken(user, user.passwordHash);
  const call = (id, body = { lat: -23, lng: -46 }, bearer = token) => fetch(url + id + '/complete', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` }, body: JSON.stringify(body) });
  try {
    assert.equal((await call('own', undefined, signToken({ id: 'admin', role: 'ADMIN' }, 'hash'))).status, 403);
    assert.equal((await call('other')).status, 404);
    assert.equal((await call('own', { lat: 91, lng: 0 })).status, 400);
    assert.equal((await call('own', { lat: -23, lng: -46, force: true })).status, 400);
    assert.equal((await call('own', { lat: 0, lng: 0 })).status, 422);
    assert.equal(writes, 0);
    shiftOpen = false;
    assert.equal((await call('own')).status, 409);
    shiftOpen = true;
    for (const status of ['PENDING', 'CANCELED']) { delivery.status = status; assert.equal((await call('own')).status, 409); }
    delivery.status = 'EN_ROUTE';
    const response = await call('own');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).nextDelivery.id, 'next');
    assert.equal(delivery.status, 'DELIVERED');
    assert.equal(delivery.deliveredDistanceM, 0);
    assert.equal(delivery.deliveredLat, -23);
    assert.ok(delivery.deliveredAt instanceof Date);
    const timestamp = delivery.deliveredAt;
    assert.equal(writes, 2);
    assert.equal((await call('own')).status, 200);
    assert.equal(writes, 2); assert.equal(delivery.deliveredAt, timestamp);
    const second = await call('next');
    assert.equal(second.status, 200); assert.equal((await second.json()).nextDelivery.id, 'later');
    const last = await call('later');
    assert.equal(last.status, 200); assert.equal((await last.json()).nextDelivery, null);
    assert.equal(stops[3].status, 'PENDING');
    assert.equal(shiftOpen, true);
    assert.equal(writes, 5);
    assert.equal((await call('own')).status, 200);
    assert.equal(writes, 5);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); }
});
