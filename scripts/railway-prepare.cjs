// Runs only in the Railway pre-deploy container, against the configured production DB.
const { spawnSync } = require('node:child_process');
const { validateProductionEnvironment } = require('./validate-production-env.cjs');
const errors = validateProductionEnvironment(process.env);
if (errors.length) {
  console.error('Configuração de produção inválida [diagnóstico v2]:');
  for (const error of errors) console.error(`- ${error}`);
  console.error('Corrija as variáveis em Environment no serviço Render e salve com novo deploy. Nenhum valor secreto foi registrado.');
  process.exit(1);
}
for (const args of [
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  ['node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.error || result.status !== 0) { console.error('Preparação do banco falhou. O deploy foi interrompido.'); process.exit(1); }
}

