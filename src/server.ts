import { assertProductionAccounts } from './production';
import http from 'http';
import { createApp } from './app';
import { config } from './config';
import { initRealtime } from './realtime';
const server = http.createServer(createApp());
initRealtime(server);
assertProductionAccounts().then(() => server.listen(config.port, config.host, () => console.log(`API rodando na porta ${config.port}`))).catch(err => { console.error(err.message); process.exit(1); });

