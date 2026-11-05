// Return only fixed diagnostic messages. Never include environment values in logs.
function validateProductionEnvironment(env) {
  const errors = [];
  if (env.NODE_ENV !== 'production') errors.push('NODE_ENV: deve ser exatamente production, sem aspas ou espaços.');
  for (const name of ['DATABASE_URL', 'ADMIN_EMAIL', 'ADMIN_PASSWORD']) {
    const value = env[name];
    if (typeof value !== 'string' || !value.trim()) {
      errors.push(`${name}: ausente ou vazia no ambiente do serviço.`);
      continue;
    }
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      errors.push(`${name}: remova as aspas externas do valor no painel.`);
    }
  }
  if (env.ADMIN_PASSWORD?.trim()) {
    if (env.ADMIN_PASSWORD.length < 12) errors.push('ADMIN_PASSWORD: precisa de pelo menos 12 caracteres.');
    if (Buffer.byteLength(env.ADMIN_PASSWORD, 'utf8') > 72) errors.push('ADMIN_PASSWORD: excede 72 bytes; use uma senha menor.');
    if (env.ADMIN_PASSWORD === 'trocar123') errors.push('ADMIN_PASSWORD: a senha padrão de teste não é permitida em produção.');
  }
  return errors;
}
module.exports = { validateProductionEnvironment };
