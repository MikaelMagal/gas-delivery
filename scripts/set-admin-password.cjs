const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const db = new PrismaClient();
(async () => {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12 || Buffer.byteLength(password) > 72 || password === 'trocar123') throw new Error('Defina ADMIN_EMAIL e ADMIN_PASSWORD forte (mínimo 12 caracteres, máximo 72 bytes) no ambiente.');
  const changed = await db.user.updateMany({ where: { email, role: 'ADMIN', active: true }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  if (!changed.count) throw new Error('Administrador ativo não encontrado.');
  console.log('Senha administrativa atualizada; entre novamente.');
})().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => db.$disconnect());
