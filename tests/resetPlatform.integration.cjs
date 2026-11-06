const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/tenant_test') throw new Error('Exige banco local descartável tenant_test:55439.');
const db = new PrismaClient();
test('explicit reset validates credentials before deletion and creates only global account', async () => {
  const env = { ...process.env, PLATFORM_ADMIN_EMAIL: 'reset-test@example.com', PLATFORM_ADMIN_PASSWORD: 'isolated-password-test' };
  const run = (script, args = [], overrides = {}) => spawnSync(process.execPath, [script, ...args], { env: { ...env, ...overrides }, encoding: 'utf8' });
  try {
    const c = await db.company.create({ data: { name: 'Disposable reset test' } });
    await db.user.create({ data: { companyId: c.id, name: 'Test', email: 'reset-old@example.com', role: 'ADMIN', passwordHash: 'old' } });
    const before = await db.user.count();
    assert.equal(run('scripts/reset-platform.cjs', ['--confirm-delete-all'], { PLATFORM_ADMIN_PASSWORD: '' }).status, 1);
    assert.equal(await db.user.count(), before);
    assert.equal(run('scripts/reset-platform.cjs').status, 0);
    assert.equal(await db.user.count(), before);
    assert.equal(run('scripts/reset-platform.cjs', ['--confirm-delete-all']).status, 0);
    assert.equal(await db.company.count(), 0);
    const users = await db.user.findMany(); assert.equal(users.length, 1); assert.equal(users[0].role, 'PLATFORM_ADMIN');
    assert.equal(run('node_modules/tsx/dist/cli.mjs', ['prisma/seed.ts']).status, 0);
    assert.equal(await db.user.count(), 1); assert.equal(await db.company.count(), 0);
    assert.equal(run('scripts/create-platform-admin.cjs').status, 1);
  } finally { await db.user.deleteMany({ where: { email: 'reset-test@example.com' } }); await db.$disconnect(); }
});
