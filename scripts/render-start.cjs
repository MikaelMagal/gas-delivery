// Render Free has no pre-deploy command: prepare the database before starting Node.
// Avoid shell quoting and keep the HTTP server in this process for shutdown signals.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const preparation = spawnSync(process.execPath, [path.join(__dirname, 'railway-prepare.cjs')], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});
if (preparation.error || preparation.status !== 0) {
  console.error('Preparação do banco falhou. O servidor não será iniciado.');
  process.exit(preparation.status || 1);
}
require(path.join(root, 'dist', 'server.js'));
