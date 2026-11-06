function platformCredentials(env = process.env) {
  const email = (env.PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = env.PLATFORM_ADMIN_PASSWORD || '';
  const errors = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('PLATFORM_ADMIN_EMAIL: ausente ou e-mail inválido.');
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) errors.push('PLATFORM_ADMIN_PASSWORD: use de 12 caracteres a 72 bytes.');
  if (!env.DATABASE_URL) errors.push('DATABASE_URL: ausente.');
  if (errors.length) throw new Error(errors.join('\n'));
  return { email, password };
}
function safeDatabaseError(error) {
  const code = error.code || error.errorCode;
  if (code === 'P2002') return 'E-mail já cadastrado. Use outro e-mail ou a limpeza explícita, se deseja excluir todos os dados.';
  if (['P2021', 'P2022'].includes(code) || error.name === 'PrismaClientValidationError') return 'Banco ou Prisma Client desatualizado. Gere o client e aplique as migrations no banco escolhido.';
  if (error.name === 'PrismaClientInitializationError') return 'Não foi possível conectar ao banco. Confira DATABASE_URL, disponibilidade do banco e acesso de rede.';
  return 'Operação não concluída. Confira conexão e migrations. Nenhum segredo foi registrado.';
}
module.exports = { platformCredentials, safeDatabaseError };
