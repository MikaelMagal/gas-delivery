// Runs only in the Railway pre-deploy container, against the configured production DB.
const { spawnSync } = require('node:child_process');
if (process.env.NODE_ENV !== 'production' || !process.env.DATABASE_URL || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12 || Buffer.byteLength(process.env.ADMIN_PASSWORD) > 72 || process.env.ADMIN_PASSWORD === 'trocar123') {
  console.error('Configure NODE_ENV=production, DATABASE_URL, ADMIN_EMAIL e uma ADMIN_PASSWORD forte de 12 caracteres a 72 bytes.');
  process.exit(1);
}
for (const args of [
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  ['node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.error || result.status !== 0) { console.error('Preparação do banco falhou. O deploy foi interrompido.'); process.exit(1); }
}
