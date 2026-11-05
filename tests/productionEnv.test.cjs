const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProductionEnvironment } = require('../scripts/validate-production-env.cjs');
const valid = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://user:private-value@host/db', ADMIN_EMAIL: 'user@example.com', ADMIN_PASSWORD: 'private-password-123' };
test('production environment accepts valid values and identifies missing variables', () => {
  assert.deepEqual(validateProductionEnvironment(valid), []);
  for (const key of Object.keys(valid)) {
    const errors = validateProductionEnvironment({ ...valid, [key]: '' });
    assert.ok(errors.some(error => error.startsWith(`${key}:`)));
  }
});
test('production environment detects quotes, password length and byte limit without exposing values', () => {
  for (const [key, value, expected] of [
    ['NODE_ENV', '"production"', /NODE_ENV:/],
    ['DATABASE_URL', `"${valid.DATABASE_URL}"`, /DATABASE_URL: remova as aspas/],
    ['ADMIN_EMAIL', `"${valid.ADMIN_EMAIL}"`, /ADMIN_EMAIL: remova as aspas/],
    ['ADMIN_PASSWORD', 'trocar123', /senha padrão/],
    ['ADMIN_PASSWORD', 'short', /pelo menos 12/],
    ['ADMIN_PASSWORD', 'á'.repeat(37), /excede 72 bytes/],
  ]) {
    const messages = validateProductionEnvironment({ ...valid, [key]: value }).join('\n');
    assert.match(messages, expected);
    for (const secret of [valid.DATABASE_URL, valid.ADMIN_EMAIL, valid.ADMIN_PASSWORD, value]) {
      assert.equal(messages.includes(secret), false);
    }
  }
});
