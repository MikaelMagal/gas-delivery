const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'test-only-secret';
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { ZodError } = require('zod');
const { prisma } = require('../dist/prisma');
const { credentialFor } = require('../dist/auth');
prisma.user.findUnique = async ({ where }) => ({ id: where.id, role: where.id === 'driver-auth' ? 'DRIVER' : 'ADMIN', active: true, passwordHash: 'test-hash' });
const realtime = require('../dist/realtime');
realtime.emitToAdmins = () => {};
realtime.emitToDriver = () => {};
const { drivers } = require('../dist/routes/drivers');
const { deliveries } = require('../dist/routes/deliveries');

test('drivers and assignment: role checks, registration, validation and pending-only writes', async () => {
  const app = express(); app.use(express.json());
  app.use('/drivers', drivers); app.use('/deliveries', deliveries);
  app.use((err, req, res, next) => res.status(err instanceof ZodError ? 400 : err.code === 'P2002' ? 409 : err.status || 500).json({ error: 'test error' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = role => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: role === 'DRIVER' ? 'driver-auth' : 'admin-auth', role, credential: credentialFor('test-hash') }, process.env.JWT_SECRET)}` });
  const call = (path, method = 'GET', body, role = 'ADMIN') => fetch(base + path, { method, headers: headers(role), ...(body ? { body: JSON.stringify(body) } : {}) });
  let registered;
  let created = 0;
  let changed = 0;
  let currentStatus = 'PENDING';
  const target = { id: 'delivery', status: 'PENDING', driverId: 'driver' };
  prisma.user.create = async ({ data, select }) => {
    assert.equal(data.role, 'DRIVER');
    assert.equal(data.name, 'Nome'); assert.equal(data.email, 'nome@example.com');
    assert.ok(await bcrypt.compare('secret123', data.passwordHash));
    assert.deepEqual(select, { id: true, name: true, email: true });
    registered = data;
    return { id: 'driver', name: data.name, email: data.email };
  };
  prisma.user.findMany = async () => [{ id: 'driver', name: 'Nome', email: 'nome@example.com', locations: [], shifts: [] }];
  prisma.user.findFirst = async ({ where }) => {
    assert.equal(where.role, 'DRIVER'); assert.equal(where.active, true);
    return where.id === 'driver' ? { id: 'driver' } : null;
  };
  prisma.delivery.create = async () => { created++; return target; };
  prisma.delivery.findUnique = async ({ where }) => where.id === 'missing' ? null : { ...target, status: currentStatus, updatedAt: new Date('2026-11-05T12:00:00.000Z') };
  prisma.$transaction = async callback => callback({ user: prisma.user, deliveryChange: { create: async () => ({}) }, delivery: { findUnique: (...args) => prisma.delivery.findUnique(...args), create: (...args) => prisma.delivery.create(...args),
    updateMany: async ({ where }) => {
      assert.equal(where.status, 'PENDING');
      if (currentStatus !== 'PENDING' || where.id === 'missing') return { count: 0 };
      changed++; return { count: 1 };
    },
    findUniqueOrThrow: async () => target,
  } });
  try {
    assert.equal((await fetch(base + '/drivers')).status, 401);
    for (const [path, method, body] of [['/drivers', 'GET'], ['/drivers', 'POST', {}], ['/deliveries/delivery', 'PATCH', { driverId: 'driver' }]]) {
      assert.equal((await call(path, method, body, 'DRIVER')).status, 403);
    }
    assert.equal((await call('/drivers', 'POST', { name: '   ', email: 'nome@example.com', password: 'secret123' })).status, 400);
    assert.equal((await call('/drivers', 'POST', { name: 'Nome', email: 'invalid', password: 'secret123' })).status, 400);
    assert.equal((await call('/drivers', 'POST', { name: 'Nome', email: 'nome@example.com', password: '123' })).status, 400);
    const registeredResponse = await call('/drivers', 'POST', { name: ' Nome ', email: ' NOME@example.com ', password: 'secret123' });
    assert.equal(registeredResponse.status, 201);
    assert.equal('passwordHash' in await registeredResponse.json(), false);
    assert.ok(registered);
    prisma.user.create = async () => { throw { code: 'P2002' }; };
    assert.equal((await call('/drivers', 'POST', { name: 'Nome', email: 'nome@example.com', password: 'secret123' })).status, 409);
    assert.deepEqual(await (await call('/drivers')).json(), [{ id: 'driver', name: 'Nome', email: 'nome@example.com', lastLocation: null, onShift: false }]);
    const payload = { customerName: 'Cliente', address: 'Rua Teste', product: 'Gas', lat: 0, lng: 0, driverId: 'admin-or-inactive' };
    assert.equal((await call('/deliveries', 'POST', payload)).status, 400);
    assert.equal(created, 0);
    assert.equal((await call('/deliveries', 'POST', { ...payload, driverId: 'driver' })).status, 201);
    assert.equal(created, 1);
    assert.equal((await call('/deliveries/delivery', 'PATCH', { driverId: 'admin-or-inactive' })).status, 400);
    assert.equal((await call('/deliveries/delivery', 'PATCH', { driverId: '' })).status, 400);
    assert.equal((await call('/deliveries/delivery', 'PATCH', { driverId: 'driver' })).status, 200);
    assert.equal(changed, 1);
    for (const status of ['EN_ROUTE', 'DELIVERED', 'CANCELED']) {
      currentStatus = status;
      assert.equal((await call('/deliveries/delivery', 'PATCH', { driverId: 'driver' })).status, 409);
    }
    assert.equal(changed, 1);
    assert.equal((await call('/deliveries/missing', 'PATCH', { driverId: 'driver' })).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
  }
});



