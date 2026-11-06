// Legacy unit tests mock storage; database isolation is exercised separately
// by multiCompany.integration.cjs against a disposable PostgreSQL instance.
const { prisma, systemPrisma } = require('../../dist/prisma');
const { tenantContext } = require('../../dist/tenant');
tenantContext.enterWith('test-company');
systemPrisma.company.findFirst = async () => ({ id: 'test-company', active: true });
systemPrisma.company.findUnique = async () => null;
const user = new Proxy(prisma.user, {
  set(target, property, value) {
    target[property] = value;
    systemPrisma.user[property] = property === 'findUnique' ? async (...args) => {
      const result = await value(...args);
      return result ? { ...result, companyId: result.companyId ?? 'test-company' } : null;
    } : value;
    return true;
  },
});
module.exports = { prisma: new Proxy(prisma, { get(target, property) { return property === 'user' ? user : target[property]; } }) };
