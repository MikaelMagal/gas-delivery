import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const production = process.env.NODE_ENV === 'production';
  if (production && (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12 || process.env.ADMIN_PASSWORD === 'trocar123')) throw new Error('Configure credenciais administrativas fortes antes do seed de produção');
  const email = (process.env.ADMIN_EMAIL ?? 'admin@empresa.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? 'trocar123';

  const company = await prisma.company.upsert({ where: { id: 'initial-company' }, update: {}, create: { id: 'initial-company', name: 'Empresa inicial' } });
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { companyId: company.id, name: 'Administrador', email, passwordHash: await bcrypt.hash(password, 10), role: 'ADMIN' },
  });

  if (!production) await prisma.user.upsert({
    where: { email: 'motoboy@empresa.com' },
    update: {},
    create: { companyId: company.id, name: 'Motoboy Teste', email: 'motoboy@empresa.com', passwordHash: await bcrypt.hash('motoboy123', 10), role: 'DRIVER' },
  });

  console.log('Seed ok. Admin:', email);
}

main().finally(() => prisma.$disconnect());

