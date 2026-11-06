// Explicit, manual bootstrap. Never promotes an existing store account.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const db = new PrismaClient();
async function main() {
  const email = (process.env.PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) throw new Error('Configure PLATFORM_ADMIN_EMAIL e PLATFORM_ADMIN_PASSWORD forte (12 caracteres a 72 bytes).');
  if (await db.user.findUnique({ where: { email } })) throw new Error('E-mail já cadastrado. Use outro e-mail para a conta global dedicada. Nenhuma conta foi alterada.');
  await db.user.create({ data: { name: 'Administrador da plataforma', email, passwordHash: await bcrypt.hash(password, 12), role: 'PLATFORM_ADMIN', companyId: null } });
  console.log('Conta global criada. Remova PLATFORM_ADMIN_PASSWORD do ambiente após o uso.');
}
main().catch(() => { console.error('Não foi possível criar a conta global. Confira variáveis, e-mail exclusivo e migrations. Nenhum segredo foi registrado.'); process.exitCode = 1; }).finally(() => db.$disconnect());
