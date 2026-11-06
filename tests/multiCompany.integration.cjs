const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
// This suite writes ONLY to the designated disposable local database.
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/tenant_test') throw new Error('Use o banco descartável local tenant_test na porta 55439. Não execute em produção.');
process.env.JWT_SECRET = 'isolated-integration-secret';
const { systemPrisma: db, prisma } = require('../dist/prisma');
const { tenantContext } = require('../dist/tenant');
const { signToken } = require('../dist/auth');
const { createApp } = require('../dist/app');
const { initRealtime } = require('../dist/realtime');
const { io: client } = require('../frontend/node_modules/socket.io-client');

test('real PostgreSQL: company isolation across API, transactions, relations, roles and socket rooms', async () => {
  const prefix = randomUUID();
  const a = await db.company.create({ data: { name: `TEST A ${prefix}` } });
  const b = await db.company.create({ data: { name: `TEST B ${prefix}` } });
  const makeUser = (name, role, companyId) => db.user.create({ data: { name, role, companyId, email: `${prefix}-${name}@example.com`, passwordHash: 'test-hash' } });
  const adminA = await makeUser('admin-a', 'ADMIN', a.id), adminB = await makeUser('admin-b', 'ADMIN', b.id);
  const driverA = await makeUser('driver-a', 'DRIVER', a.id), driverB = await makeUser('driver-b', 'DRIVER', b.id);
  const root = await makeUser('platform', 'PLATFORM_ADMIN', null);
  const server = createApp().listen(0, '127.0.0.1');
  const io = initRealtime(server);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (user, path, method = 'GET', body) => fetch(base + '/api' + path, { method, headers: { ...(user ? { Authorization: `Bearer ${signToken(user, user.passwordHash)}` } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const payload = { customerName: 'TEST delivery', address: 'Rua teste 123', lat: -19, lng: -43, product: 'Gas', quantity: 1 };
  const sockets = [];
  const connect = async user => {
    const s = client(base, { auth: { token: signToken(user, user.passwordHash) }, transports: ['websocket'], reconnection: false }); sockets.push(s);
    await new Promise((resolve, reject) => { s.once('connect', resolve); s.once('connect_error', reject); }); return s;
  };
  try {
    assert.equal((await call(null, '/deliveries')).status, 401);
    assert.equal((await call(adminA, '/platform/companies')).status, 403);
    assert.equal((await call(driverA, '/platform/companies')).status, 403);
    assert.equal((await call(root, '/deliveries')).status, 403);
    assert.equal((await call(adminA, '/platform/access', 'POST', { companyId: b.id })).status, 403);
    let r = await call(adminA, '/deliveries', 'POST', { ...payload, driverId: driverB.id }); assert.equal(r.status, 400);
    r = await call(adminA, '/deliveries', 'POST', { ...payload, driverId: driverA.id, companyId: b.id }); assert.equal(r.status, 201);
    const da = await r.json(); assert.equal(da.companyId, a.id);
    r = await call(adminB, '/deliveries', 'POST', { ...payload, driverId: driverB.id }); assert.equal(r.status, 201); const d = await r.json();
    assert.deepEqual((await (await call(adminA, '/deliveries')).json()).map(v => v.id), [da.id]);
    assert.deepEqual((await (await call(driverA, '/deliveries/mine')).json()).map(v => v.id), [da.id]);
    assert.deepEqual((await (await call(adminA, '/drivers')).json()).map(v => v.id), [driverA.id]);
    for (const [path, method, body] of [
      [`/deliveries/${d.id}`, 'PATCH', { notes: 'forbidden' }],
      [`/deliveries/${d.id}`, 'PATCH', { status: 'CANCELED' }],
      [`/deliveries/${d.id}/reopen`, 'POST', { reason: 'forbidden test' }],
      [`/deliveries/${d.id}/history`, 'GET'],
      [`/drivers/${driverB.id}`, 'DELETE'],
      [`/drivers/${driverB.id}/password`, 'PATCH', { password: 'new-password-for-test' }],
      [`/route/delivery/${d.id}?fromLat=-19&fromLng=-43`, 'GET'],
    ]) assert.equal((await call(adminA, path, method, body)).status, 404, path);
    assert.equal((await call(adminA, `/deliveries/${da.id}`, 'PATCH', { driverId: driverB.id })).status, 400);
    assert.equal((await call(driverA, `/deliveries/${d.id}/start`, 'POST')).status, 404);
    assert.equal((await call(driverA, `/deliveries/${d.id}/complete`, 'POST', { lat: -19, lng: -43 })).status, 404);
    assert.equal((await call(driverA, '/deliveries')).status, 403);
    const today = new Date().toISOString().slice(0, 10);
    const report = await (await call(adminA, `/deliveries/report?from=${today}&to=${today}`)).json();
    assert.ok(report.items.every(v => v.companyId === a.id)); assert.ok(report.drivers.every(v => v.id !== driverB.id));
    await db.location.create({ data: { companyId: b.id, driverId: driverB.id, lat: 1, lng: 2 } });
    assert.deepEqual(await (await call(adminA, `/locations/${driverB.id}/trail`)).json(), []);
    // Composite database foreign key rejects a cross-company link even through the global client.
    await assert.rejects(db.delivery.create({ data: { ...payload, companyId: a.id, driverId: driverB.id } }), e => e.code === 'P2003');
    await assert.rejects(prisma.delivery.findMany(), /Selecione uma empresa/);
    const result = await Promise.all([a, b].map(c => tenantContext.run(c.id, () => prisma.$transaction(async tx => {
      const list = await tx.delivery.findMany(); assert.ok(list.every(d => d.companyId === c.id)); return list.length;
    })))); assert.deepEqual(result, [1, 1]);
    assert.equal((await call(driverA, '/shifts/start', 'POST')).status, 201);
    assert.equal((await call(driverA, `/deliveries/${da.id}/start`, 'POST')).status, 200);
    assert.equal((await call(driverA, `/deliveries/${da.id}/complete`, 'POST', { lat: -19, lng: -43 })).status, 200);
    assert.equal((await db.delivery.findUnique({ where: { id: d.id } })).status, 'PENDING');
    const sa = await connect(adminA), sb = await connect(adminB);
    const eventsA = [], eventsB = [];
    sa.on('delivery:updated', v => eventsA.push(v)); sb.on('delivery:updated', v => eventsB.push(v));
    assert.equal((await call(adminA, `/deliveries/${da.id}/reopen`, 'POST', { reason: 'integration reopen' })).status, 200);
    await new Promise(r => setTimeout(r, 120)); assert.ok(eventsA.some(e => e.id === da.id)); assert.deepEqual(eventsB, []);
    assert.equal((await call(adminB, `/deliveries/${da.id}/history`)).status, 404);
    const selected = { ...root, companyId: b.id };
    assert.deepEqual((await (await call(selected, '/deliveries')).json()).map(v => v.id), [d.id]);
    // Ordinary admin's forged scope claim is ignored: database membership wins.
    assert.deepEqual((await (await call({ ...adminA, companyId: b.id }, '/deliveries')).json()).map(v => v.id), [da.id]);
    r = await call(root, '/platform/companies', 'POST', { name: `new ${prefix}`, admin: { name: 'New admin', email: `${prefix}-new@example.com`, password: 'integration-strong-password' } }); assert.equal(r.status, 201);
    const created = await r.json(); const before = await db.company.count();
    assert.equal((await call(root, '/platform/companies', 'POST', { name: 'duplicate', admin: { name: 'New admin', email: adminA.email, password: 'integration-strong-password' } })).status, 409);
    assert.equal(await db.company.count(), before); // company creation rolled back on duplicate email
    r = await call(root, `/platform/companies/${created.id}/admins`, 'POST', { name: 'Second admin', email: `${prefix}-second@example.com`, password: 'integration-strong-password' });
    assert.equal(r.status, 201);
    const second = await r.json();
    const secondUser = await db.user.findUnique({ where: { id: second.id } });
    assert.equal(secondUser.companyId, created.id);
    assert.equal((await call(adminA, `/platform/admins/${second.id}`, 'PATCH', { email: `${prefix}-blocked@example.com` })).status, 403);
    assert.equal((await call(root, `/platform/admins/${second.id}`, 'PATCH', { email: adminA.email })).status, 409);
    assert.equal((await call(root, `/platform/admins/${second.id}`, 'PATCH', { email: 'invalid' })).status, 400);
    assert.equal((await call(root, `/platform/admins/${second.id}`, 'PATCH', { email: ` ${prefix}-changed@EXAMPLE.COM ` })).status, 204);
    const changedAdmin = await db.user.findUnique({ where: { id: second.id } });
    assert.equal(changedAdmin.email, `${prefix}-changed@example.com`);
    assert.equal(changedAdmin.passwordHash, secondUser.passwordHash);
    assert.equal((await call(root, `/platform/admins/${root.id}`, 'PATCH', { email: `${prefix}-root-change@example.com` })).status, 404);
    assert.equal((await call(adminA, `/platform/admins/${second.id}`, 'PATCH', { active: false })).status, 403);
    assert.equal((await call(root, `/platform/admins/${second.id}`, 'PATCH', { password: 'integration-new-password' })).status, 204);
    assert.equal((await call(secondUser, '/deliveries')).status, 401);
    assert.equal((await call(root, `/platform/admins/${second.id}`, 'PATCH', { active: false })).status, 204);
    const deletePath = `/platform/companies/${created.id}`;
    const confirmationName = created.name;
    assert.equal((await call(adminA, deletePath, 'DELETE', { confirmationName })).status, 403);
    assert.equal((await call(driverA, deletePath, 'DELETE', { confirmationName })).status, 403);
    assert.equal((await call(root, deletePath, 'DELETE', { confirmationName })).status, 409);
    const disposableDriver = await makeUser('delete-driver', 'DRIVER', created.id);
    const disposableDelivery = await db.delivery.create({ data: { ...payload, companyId: created.id, driverId: disposableDriver.id } });
    await db.shift.create({ data: { companyId: created.id, driverId: disposableDriver.id } });
    await db.location.create({ data: { companyId: created.id, driverId: disposableDriver.id, lat: 1, lng: 2 } });
    await db.deliveryChange.create({ data: { companyId: created.id, deliveryId: disposableDelivery.id, actorId: second.id, action: 'EDIT', before: {}, after: {} } });
    assert.equal((await call(root, deletePath, 'PATCH', { active: false })).status, 204);
    assert.equal((await call(root, deletePath, 'DELETE', { confirmationName: 'wrong' })).status, 409);
    assert.ok(await db.delivery.findUnique({ where: { id: disposableDelivery.id } }));
    assert.equal((await call(root, deletePath, 'DELETE', { confirmationName })).status, 204);
    assert.equal(await db.company.findUnique({ where: { id: created.id } }), null);
    for (const model of ['user', 'delivery', 'deliveryChange', 'shift', 'location']) assert.equal(await db[model].count({ where: { companyId: created.id } }), 0);
    assert.ok(await db.user.findUnique({ where: { id: root.id } }));
    assert.ok(await db.delivery.findUnique({ where: { id: da.id } }));
    assert.ok(await db.delivery.findUnique({ where: { id: d.id } }));
    assert.equal((await call(root, deletePath, 'DELETE', { confirmationName })).status, 404);
    assert.equal((await call(root, `/platform/companies/${b.id}`, 'PATCH', { active: false })).status, 204);
    await new Promise(r => setTimeout(r, 120)); assert.equal(sb.connected, false);
    assert.equal((await call(adminB, '/deliveries')).status, 401);
    assert.equal((await call(adminA, '/deliveries')).status, 200);
  } finally {
    for (const s of sockets) s.disconnect();
    await new Promise(r => io.close(r));
    await db.deliveryChange.deleteMany({ where: { companyId: { in: [a.id, b.id] } } });
    await db.delivery.deleteMany({ where: { companyId: { in: [a.id, b.id] } } });
    await db.location.deleteMany({ where: { companyId: { in: [a.id, b.id] } } });
    await db.shift.deleteMany({ where: { companyId: { in: [a.id, b.id] } } });
    await db.user.deleteMany({ where: { id: { in: [adminA.id, adminB.id, driverA.id, driverB.id, root.id] } } });
    await db.company.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await db.$disconnect();
  }
});
