const test = require('node:test');
const assert = require('node:assert/strict');
const { platformCredentials, safeDatabaseError } = require('../scripts/platform-credentials.cjs');
test('platform setup identifies invalid variable names and never logs secrets', () => {
  assert.throws(() => platformCredentials({}), /PLATFORM_ADMIN_EMAIL[\s\S]*PLATFORM_ADMIN_PASSWORD[\s\S]*DATABASE_URL/);
  const input = { DATABASE_URL: 'private-url', PLATFORM_ADMIN_EMAIL: ' Owner@example.com ', PLATFORM_ADMIN_PASSWORD: 'private-password-123' };
  assert.equal(platformCredentials(input).email, 'owner@example.com');
  assert.throws(() => platformCredentials({ ...input, PLATFORM_ADMIN_PASSWORD: '😀'.repeat(20) }), /72 bytes/);
  for (const code of ['P2002', 'P2021', 'P2022', 'unknown']) assert.ok(!safeDatabaseError({ code, message: input.PLATFORM_ADMIN_PASSWORD }).includes(input.PLATFORM_ADMIN_PASSWORD));
});
