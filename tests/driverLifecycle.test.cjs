const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'test-only-secret';
const express = require('express');
const bcrypt = require('bcryptjs');
const { ZodError } = require('zod');
const { prisma } = require('../dist/prisma');
const { signToken } = require('../dist/auth');
const rt = require('../dist/realtime');
rt.emitToAdmins = () => {}; rt.emitToDriver = () => {}; rt.disconnectDriver = () => {};
const { drivers } = require('../dist/routes/drivers');
const { shifts } = require('../dist/routes/shifts');
const { deliveries } = require('../dist/routes/deliveries');
const { authRoutes } = require('../dist/routes/auth');

test('driver lifecycle: shifts, ownership, password revocation and safe removal', async () => {
  const users = {
    admin: { id: 'admin', role: 'ADMIN', active: true, passwordHash: 'admin-hash' },
    driver: { id: 'driver', role: 'DRIVER', active: true, passwordHash: 'old-hash' },
  };
  let shift = null;
  let openDelivery = false;
  const stops = [{ id: 'first', driverId: 'driver', status: 'PENDING' }, { id: 'second', driverId: 'driver', status: 'PENDING' }];
  prisma.user.findUnique = async ({ where }) => where.email === 'driver@example.com' ? { ...users.driver, name: 'Motoboy', email: where.email } : users[where.id] || null;
  prisma.user.findFirst = async ({ where }) => {
    const u = users[where.id]; return u?.role === where.role && u.active ? u : null;
  };
  prisma.user.update = async ({ where, data }) => Object.assign(users[where.id], data);
  prisma.user.updateMany = async ({ where, data }) => {
    const u = users[where.id];
    if (!u?.active || u.role !== where.role) return { count: 0 };
    Object.assign(u, data); return { count: 1 };
  };
  prisma.shift.findFirst = async () => shift;
  prisma.shift.create = async ({ data }) => (shift = { id: 'shift', driverId: data.driverId, startedAt: new Date().toISOString(), endedAt: null });
  prisma.shift.updateMany = async () => { shift = null; return { count: 1 }; };
  prisma.delivery.findFirst = async ({ where }) => {
    if (where.id) return stops.find(d => d.id === where.id && d.driverId === where.driverId) || null;
    return openDelivery ? { id: 'open' } : null;
  };
  prisma.delivery.findMany = async ({ where }) => { assert.equal(where.driverId, 'driver'); return stops; };
  prisma.delivery.findUniqueOrThrow = async ({ where }) => stops.find(d => d.id === where.id);
  prisma.delivery.updateMany = async ({ where, data }) => {
    const selected = stops.filter(d => (!where.id || d.id === where.id) && d.driverId === where.driverId && (!where.NOT || d.id !== where.NOT.id) && (typeof where.status === 'string' ? d.status === where.status : where.status.in.includes(d.status)));
    selected.forEach(d => Object.assign(d, data)); return { count: selected.length };
  };
  prisma.$transaction = async fn => typeof fn === 'function' ? fn(prisma) : Promise.all(fn);
  const app = express(); app.use(express.json()); app.use('/auth', authRoutes); app.use('/drivers', drivers); app.use('/shifts', shifts); app.use('/deliveries', deliveries);
  app.use((err, req, res, next) => res.status(err instanceof ZodError ? 400 : err.status || 500).json({ error: 'test error' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const adminToken = signToken(users.admin, users.admin.passwordHash);
  const oldToken = signToken(users.driver, users.driver.passwordHash);
  const call = (path, method = 'GET', token = oldToken, body) => fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    assert.equal(await (await call('/shifts/current')).json(), null);
    assert.equal((await call('/shifts/current', 'GET', adminToken)).status, 403);
    assert.equal((await call('/deliveries/first/start', 'POST')).status, 409);
    assert.equal((await call('/shifts/start', 'POST')).status, 201);
    assert.equal((await call('/shifts/start', 'POST')).status, 200);
    assert.equal((await (await call('/shifts/current')).json()).id, 'shift');
    assert.equal((await call('/deliveries/stranger/start', 'POST')).status, 404);
    assert.equal((await call('/deliveries/first/start', 'POST')).status, 200);
    assert.equal(stops[0].status, 'EN_ROUTE');
    assert.equal((await call('/deliveries/second/start', 'POST')).status, 200);
    assert.equal(stops[0].status, 'PENDING'); assert.equal(stops[1].status, 'EN_ROUTE');
    assert.equal((await call('/drivers/driver', 'DELETE', oldToken)).status, 403);
    assert.equal((await call('/drivers/driver', 'DELETE', adminToken)).status, 409);
    assert.equal((await call('/shifts/end', 'POST')).status, 204);
    assert.equal(stops[1].status, 'PENDING');
    assert.equal(await (await call('/shifts/current')).json(), null);
    openDelivery = true;
    assert.equal((await call('/drivers/driver', 'DELETE', adminToken)).status, 409);
    assert.equal((await call('/drivers/driver/password', 'PATCH', oldToken, { password: 'new-pass123' })).status, 403);
    assert.equal((await call('/drivers/admin/password', 'PATCH', adminToken, { password: 'new-pass123' })).status, 404);
    assert.equal((await call('/drivers/driver/password', 'PATCH', adminToken, { password: 'abc' })).status, 400);
    const reset = await call('/drivers/driver/password', 'PATCH', adminToken, { password: 'new-pass123' });
    assert.equal(reset.status, 204); assert.equal(await reset.text(), '');
    assert.ok(await bcrypt.compare('new-pass123', users.driver.passwordHash));
    assert.equal((await call('/deliveries/mine')).status, 401);
    const login = await call('/auth/login', 'POST', '', { email: 'driver@example.com', password: 'new-pass123' });
    assert.equal(login.status, 200);
    const loginData = await login.json();
    assert.equal(loginData.user.role, 'DRIVER');
    assert.equal('passwordHash' in loginData.user, false);
    assert.equal(loginData.token, undefined);
    const sessionCookie = login.headers.get('set-cookie');
    assert.ok(sessionCookie.includes('HttpOnly'));
    assert.ok(sessionCookie.includes('SameSite=Strict'));
    const newToken = sessionCookie.split(';')[0].split('=')[1];
    assert.equal((await call('/deliveries/mine', 'GET', newToken)).status, 200);
    openDelivery = false;
    assert.equal((await call('/drivers/admin', 'DELETE', adminToken)).status, 404);
    assert.equal((await call('/drivers/driver', 'DELETE', adminToken)).status, 204);
    assert.equal(users.driver.active, false);
    assert.equal((await call('/auth/login', 'POST', '', { email: 'driver@example.com', password: 'new-pass123' })).status, 401);
    assert.equal(stops.length, 2);
    assert.equal((await call('/deliveries/mine', 'GET', newToken)).status, 401);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); }
});


