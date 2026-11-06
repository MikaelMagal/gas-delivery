const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'production';
process.env.APP_ORIGINS = 'https://entregas.example.com';
process.env.JWT_SECRET = 'a492cfd428b74a7e98314b7c8ead74589b5d0a8f33f2ec912';
process.env.TRUST_PROXY = 'loopback';
const bcrypt = require('bcryptjs');
const { prisma } = require('./helpers/companyMocks.cjs');
const { createApp } = require('../dist/app');
const { assertProductionAccounts } = require('../dist/production');
test('web security: HTTPS, origin, HttpOnly cookie, identity, logout, CSP and login limit', async () => {
  const passwordHash = await bcrypt.hash('password-test123', 4);
  const user = { id: 'driver', name: 'Nome', role: 'DRIVER', active: true, passwordHash };
  prisma.user.findUnique = async ({ where, select }) => {
    if (where.email && where.email !== 'driver@example.com') return null;
    return select ? Object.fromEntries(Object.keys(select).map(key => [key, user[key]])) : user;
  };
  prisma.user.findMany = async () => [{ email: 'motoboy@empresa.com', passwordHash }];
  await assert.rejects(assertProductionAccounts(), /Conta de teste/);
  prisma.user.findMany = async () => [];
  await assertProductionAccounts();
  const app = createApp();
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, options = {}) => fetch(base + path, { ...options, headers: { 'X-Forwarded-Proto': 'https', Origin: 'https://entregas.example.com', ...options.headers } });
  try {
    assert.equal((await fetch(base + '/api/auth/me')).status, 426);
    assert.equal((await call('/api/auth/me', { headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(base + '/api/health')).status, 200);
    for (const endpoint of ['/api/drivers', '/api/deliveries', '/api/deliveries/mine', '/api/shifts/current', '/api/locations/other/trail', '/api/route', '/api/geocoding', '/drivers', '/deliveries']) {
      const denied = await call(endpoint);
      assert.equal(denied.status, 401, `${endpoint} must require authentication`);
      const body = await denied.json();
      assert.equal('passwordHash' in body, false);
      assert.equal('deliveries' in body, false);
    }
    assert.equal((await call('/api/deliveries/other/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: 0, lng: 0 }) })).status, 401);
    const home = await call('/');
    assert.equal(home.status, 200);
    assert.ok(home.headers.get('content-security-policy').includes("script-src 'self'"));
    assert.ok(home.headers.get('strict-transport-security'));
    assert.ok(home.headers.get('content-security-policy').includes('https://tile.openstreetmap.org'));
    assert.equal(home.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(home.headers.get('permissions-policy'), 'geolocation=(self), camera=(), microphone=()');
    assert.equal(home.headers.get('x-powered-by'), null);
    const login = await call('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'driver@example.com', password: 'password-test123' }) });
    assert.equal(login.status, 200);
    assert.deepEqual(await login.json(), { user: { id: 'driver', name: 'Nome', role: 'DRIVER', companyId: 'test-company' } });
    const cookie = login.headers.get('set-cookie');
    for (const text of ['__Host-gas_session=', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(cookie.includes(text));
    assert.equal(login.headers.get('cache-control'), 'no-store');
    const headers = { Cookie: cookie.split(';')[0] };
    const me = await call('/api/auth/me', { headers });
    assert.equal(me.status, 200);
    assert.deepEqual(await me.json(), { user: { id: 'driver', name: 'Nome', role: 'DRIVER', companyId: 'test-company' } });
    assert.equal((await call('/api/drivers', { headers })).status, 403);
    const logout = await call('/api/auth/logout', { method: 'POST', headers });
    assert.equal(logout.status, 204);
    assert.ok(logout.headers.get('set-cookie').includes('Expires=Thu, 01 Jan 1970'));
    assert.equal((await call('/api/auth/me')).status, 401);
    let last;
    for (let i = 0; i < 21; i++) last = await call('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'notfound@example.com', password: 'wrong' }) });
    assert.equal(last.status, 429);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); }
});




