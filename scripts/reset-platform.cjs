// Explicit full reset. Preserves schema/migrations. Run only during maintenance.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { platformCredentials, safeDatabaseError } = require('./platform-credentials.cjs');
const db = new PrismaClient();
async function main() {
  const { email, password } = platformCredentials();
  if (!process.argv.includes('--confirm-delete-all')) {
    console.log('Simulação: nenhuma alteração. Para apagar todos os dados e criar somente a conta global, use --confirm-delete-all.');
    console.log(JSON.stringify({ companies: await db.company.count(), users: await db.user.count(), deliveries: await db.delivery.count(), changes: await db.deliveryChange.count(), shifts: await db.shift.count(), locations: await db.location.count() }));
    return;
  }
  const hash = await bcrypt.hash(password, 12);
  await db.$transaction(async tx => {
    await tx.$executeRaw`LOCK TABLE "Company", "User", "Delivery", "DeliveryChange", "Shift", "Location" IN ACCESS EXCLUSIVE MODE`;
    await tx.deliveryChange.deleteMany();
    await tx.location.deleteMany();
    await tx.shift.deleteMany();
    await tx.delivery.deleteMany();
    await tx.user.deleteMany();
    await tx.company.deleteMany();
    await tx.user.create({ data: { name: 'Administrador da plataforma', email, passwordHash: hash, role: 'PLATFORM_ADMIN', companyId: null } });
  }, { timeout: 30000 });
  console.log('Limpeza concluída e conta global criada. Remova PLATFORM_ADMIN_PASSWORD do ambiente. Reinicie o serviço para encerrar conexões antigas.');
}
main().catch(error => { console.error(error.constructor === Error ? error.message : safeDatabaseError(error)); process.exitCode = 1; }).finally(() => db.$disconnect());
