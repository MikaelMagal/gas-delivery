// Explicit, manual bootstrap. Never promotes an existing store account.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { platformCredentials, safeDatabaseError } = require('./platform-credentials.cjs');
const db = new PrismaClient();
async function main() {
  const { email, password } = platformCredentials();
  if (await db.user.findUnique({ where: { email } })) throw new Error('E-mail já cadastrado. Use outro e-mail para a conta global dedicada. Nenhuma conta foi alterada.');
  await db.user.create({ data: { name: 'Administrador da plataforma', email, passwordHash: await bcrypt.hash(password, 12), role: 'PLATFORM_ADMIN', companyId: null } });
  console.log('Conta global criada. Remova PLATFORM_ADMIN_PASSWORD do ambiente após o uso.');
}
main().catch(error => { console.error(error.constructor === Error ? error.message : safeDatabaseError(error)); process.exitCode = 1; }).finally(() => db.$disconnect());
