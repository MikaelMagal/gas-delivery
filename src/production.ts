import bcrypt from 'bcryptjs';
import { config } from './config';
import { systemPrisma as prisma } from './prisma';
export async function assertProductionAccounts() {
  if (!config.production) return;
  const accounts = await prisma.user.findMany({ where: { active: true }, select: { role: true, passwordHash: true, email: true } });
  for (const account of accounts) {
    if (account.email === 'motoboy@empresa.com' || await bcrypt.compare('trocar123', account.passwordHash) || await bcrypt.compare('motoboy123', account.passwordHash)) {
      throw new Error('Conta de teste ou senha padrão ativa. Desative a conta de teste e altere as senhas padrão antes de publicar.');
    }
  }
}
