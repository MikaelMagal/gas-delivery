const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'integration-test-only-secret';
const express = require('express');
const jwt = require('jsonwebtoken');
const { prisma } = require('./helpers/companyMocks.cjs');
const { credentialFor } = require('../dist/auth');
prisma.user.findUnique = async ({ where }) => ({ id: where.id, role: where.id === 'driver-auth' ? 'DRIVER' : 'ADMIN', active: true, passwordHash: 'test-hash' });
const { geocoding } = require('../dist/routes/geocoding');

test('geocoding: auth, configuration, provider mapping, cache and throttle', async () => {
  const app = express();
  app.use('/geocoding', geocoding);
  app.use((err, req, res, next) => res.status(400).json({ error: 'invalid' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const originalFetch = global.fetch;
  const url = `http://127.0.0.1:${server.address().port}/geocoding`;
  const admin = { Authorization: `Bearer ${jwt.sign({ id: 'admin-auth', role: 'ADMIN', credential: credentialFor('test-hash') }, process.env.JWT_SECRET)}` };
  const driver = { Authorization: `Bearer ${jwt.sign({ id: 'driver-auth', role: 'DRIVER', credential: credentialFor('test-hash') }, process.env.JWT_SECRET)}` };
  try {
    assert.equal((await originalFetch(url)).status, 401);
    assert.equal((await originalFetch(url, { headers: driver })).status, 403);
    assert.equal((await originalFetch(url + '?address=abc', { headers: admin })).status, 400);
    delete process.env.GEOAPIFY_API_KEY;
    assert.equal((await originalFetch(url + '?address=Rua%20Exemplo', { headers: admin })).status, 503);
    process.env.GEOAPIFY_API_KEY = 'test-provider-key';
    let calls = 0;
    global.fetch = async (target, options) => {
      calls++;
      assert.equal(target.hostname, 'api.geoapify.com');
      assert.equal(target.searchParams.get('filter'), 'countrycode:br');
      assert.ok(options.signal);
      return new Response(JSON.stringify({ results: [{ formatted: 'Rua Exemplo, Brasil', lat: -23, lon: -46 }] }));
    };
    const response = await originalFetch(url + '?address=Rua%20Exemplo', { headers: admin });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{ address: 'Rua Exemplo, Brasil', lat: -23, lng: -46 }]);
    assert.equal((await originalFetch(url + '?address=Rua%20Exemplo', { headers: admin })).status, 200);
    assert.equal(calls, 1);
    assert.equal((await originalFetch(url + '?address=Outro%20endereco', { headers: admin })).status, 429);
    await new Promise(resolve => setTimeout(resolve, 1050));
    global.fetch = async () => { throw new Error('provider failure with secret'); };
    const failed = await originalFetch(url + '?address=Outro%20endereco', { headers: admin });
    assert.equal(failed.status, 502);
    assert.equal((await failed.text()).includes('secret'), false);
  } finally {
    global.fetch = originalFetch;
    delete process.env.GEOAPIFY_API_KEY;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

