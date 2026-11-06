const test = require('node:test');
const assert = require('node:assert/strict');
const { scopeQuery, tenantContext, tenantId } = require('../dist/tenant');
test('tenant scope fails closed, overrides forged filters and rejects unsafe writes', async () => {
  assert.throws(() => tenantId(), /Selecione/);
  for (const operation of ['findMany', 'findUnique', 'count', 'updateMany', 'deleteMany']) {
    const args = scopeQuery('Delivery', operation, { where: { id: 'other', companyId: 'b' } }, 'a');
    assert.equal(args.where.companyId, 'a'); assert.equal(args.where.id, 'other');
  }
  assert.throws(() => scopeQuery('Company', 'findMany', {}, 'a'));
  assert.throws(() => scopeQuery('User', 'upsert', {}, 'a'));
  assert.throws(() => scopeQuery('User', 'create', { data: { companyId: 'b' } }, 'a'));
  assert.throws(() => scopeQuery('Delivery', 'create', { data: { driver: { connect: { id: 'b' } } } }, 'a'));
  assert.equal(scopeQuery('Delivery', 'create', { data: {} }, 'a').data.companyId, 'a');
  const result = await Promise.all(['a', 'b'].map(id => tenantContext.run(id, async () => { await new Promise(r => setTimeout(r, 5)); return tenantId(); })));
  assert.deepEqual(result, ['a', 'b']);
});
