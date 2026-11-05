const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const { ZodError } = require('zod');
const { prisma } = require('../dist/prisma');
const { signToken } = require('../dist/auth');
const rt = require('../dist/realtime'); rt.emitToAdmins = () => {};
const { deliveries } = require('../dist/routes/deliveries');
test('delivery confirmation: ownership, roles, GPS bounds, radius, idempotency and persisted proof', async () => {
  const user = { id: 'driver', role: 'DRIVER', active: true, passwordHash: 'hash' };
  let shiftOpen = true;
  const delivery = { id: 'own', driverId: 'driver', status: 'EN_ROUTE', lat: -23, lng: -46 };
  let writes = 0;
  prisma.user.findUnique = async ({ where }) => ({ ...user, id: where.id, role: where.id === 'admin' ? 'ADMIN' : 'DRIVER' });
  prisma.delivery.findFirst = async ({ where }) => where.id === 'own' && where.driverId === 'driver' ? delivery : null;
  prisma.shift.findFirst = async () => shiftOpen ? { id: 'shift' } : null;
  prisma.delivery.updateMany = async ({ where, data }) => {
    assert.deepEqual(where, { id: 'own', driverId: 'driver', status: 'EN_ROUTE' });
    Object.assign(delivery, data); writes++; return { count: 1 };
  };
  prisma.delivery.findUniqueOrThrow = async () => delivery;
  prisma.$transaction = async callback => callback(prisma);
  const app = express(); app.use(express.json()); app.use('/deliveries', deliveries);
  app.use((err, req, res, next) => res.status(err instanceof ZodError ? 400 : 500).json({ error: 'invalid' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/deliveries/`;
  const token = signToken(user, user.passwordHash);
  const call = (id, body, bearer = token) => fetch(url + id + '/complete', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` }, body: JSON.stringify(body) });
  try {
    assert.equal((await call('own', { lat: -23, lng: -46 }, signToken({ id: 'admin', role: 'ADMIN' }, 'hash'))).status, 403);
    assert.equal((await call('other', { lat: -23, lng: -46 })).status, 404);
    assert.equal((await call('own', { lat: 91, lng: 0 })).status, 400);
    assert.equal((await call('own', { lat: -23, lng: -46, force: true })).status, 400);
    assert.equal((await call('own', { lat: 0, lng: 0 })).status, 422);
    assert.equal(writes, 0);
    shiftOpen = false;
    assert.equal((await call('own', { lat: -23, lng: -46 })).status, 409);
    shiftOpen = true;
    for (const status of ['PENDING', 'CANCELED']) {
      delivery.status = status;
      assert.equal((await call('own', { lat: -23, lng: -46 })).status, 409);
    }
    delivery.status = 'EN_ROUTE';
    const response = await call('own', { lat: -23, lng: -46 });
    assert.equal(response.status, 200);
    assert.equal(delivery.status, 'DELIVERED');
    assert.equal(delivery.deliveredDistanceM, 0);
    assert.equal(delivery.deliveredLat, -23);
    assert.ok(delivery.deliveredAt instanceof Date);
    const timestamp = delivery.deliveredAt;
    assert.equal((await call('own', { lat: -23, lng: -46 })).status, 200);
    assert.equal(writes, 1); assert.equal(delivery.deliveredAt, timestamp);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); }
});
