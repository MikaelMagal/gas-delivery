const test = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'test-routing-secret';
const express = require('express');
const { ZodError } = require('zod');
const { config } = require('../dist/config');
const { prisma } = require('../dist/prisma');
const { signToken } = require('../dist/auth');
const { routing } = require('../dist/routes/routing');
test('routing: missing token fallback, ownership, validation, provider conversion and sanitized failures', async () => {
  const originalFetch = global.fetch;
  const originalToken = config.mapboxToken;
  prisma.user.findUnique = async ({ where }) => ({ id: where.id, role: where.id === 'admin' ? 'ADMIN' : 'DRIVER', active: true, passwordHash: 'hash' });
  prisma.delivery.findFirst = async ({ where, select }) => {
    assert.deepEqual(select, { lat: true, lng: true });
    if (where.driverId && where.driverId !== 'driver') return null;
    return where.id === 'own' || (!where.driverId && where.id === 'other') ? { lat: -23, lng: -46 } : null;
  };
  const app = express(); app.use('/route', routing);
  app.use((err, req, res, next) => res.status(err instanceof ZodError ? 400 : 500).json({ error: 'invalid' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/route`;
  const call = (suffix, role = 'DRIVER') => originalFetch(base + suffix, { headers: { Authorization: `Bearer ${signToken({ id: role === 'ADMIN' ? 'admin' : 'driver', role }, 'hash')}` } });
  let externalCalls = 0;
  try {
    config.mapboxToken = '';
    assert.equal((await originalFetch(base + '/status')).status, 401);
    assert.deepEqual(await (await call('/status')).json(), { roadRoutesAvailable: false, tilesEnabled: true });
    assert.equal((await call('/delivery/own?fromLat=-23&fromLng=-46')).status, 503);
    assert.equal((await call('/delivery/other?fromLat=-23&fromLng=-46')).status, 404);
    assert.equal((await call('/delivery/own?fromLat=91&fromLng=-46')).status, 400);
    assert.equal((await call('?fromLat=0&fromLng=181&toLat=0&toLng=0')).status, 400);
    config.mapboxToken = 'test-key-never-return';
    assert.equal((await (await call('/status')).json()).roadRoutesAvailable, true);
    global.fetch = async (url, options) => {
      externalCalls++;
      assert.equal(url.hostname, 'api.mapbox.com');
      assert.ok(url.pathname.endsWith('/-46.1,-23.1;-46,-23'));
      assert.ok(options.signal);
      return new Response(JSON.stringify({ routes: [{ distance: 1500.2, duration: 125.7, geometry: { coordinates: [[-46.1, -23.1], [-46, -23]] } }] }));
    };
    const response = await call('/delivery/own?fromLat=-23.1&fromLng=-46.1');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { coords: [{ latitude: -23.1, longitude: -46.1 }, { latitude: -23, longitude: -46 }], distanceM: 1500, durationS: 126 });
    assert.equal(externalCalls, 1);
    assert.equal((await call('/delivery/other?fromLat=-23.1&fromLng=-46.1', 'ADMIN')).status, 200);
    global.fetch = async () => new Response(JSON.stringify({ routes: [] }));
    assert.equal((await call('/delivery/own?fromLat=0&fromLng=0')).status, 404);
    global.fetch = async () => { throw new Error('test-key-never-return'); };
    const failed = await call('/delivery/own?fromLat=0&fromLng=0');
    assert.equal(failed.status, 502);
    assert.equal((await failed.text()).includes('test-key-never-return'), false);
    global.fetch = async () => new Response('blocked', { status: 403 });
    assert.equal((await call('/delivery/own?fromLat=0&fromLng=0')).status, 502);
  } finally { global.fetch = originalFetch; config.mapboxToken = originalToken; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); }
});
