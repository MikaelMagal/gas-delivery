import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { config } from './config';
import { authRoutes } from './routes/auth';
import { drivers } from './routes/drivers';
import { deliveries } from './routes/deliveries';
import { locations } from './routes/locations';
import { shifts } from './routes/shifts';
import { routing } from './routes/routing';
import { geocoding } from './routes/geocoding';
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], fontSrc: ["'self'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], frameAncestors: ["'none'"], upgradeInsecureRequests: config.production ? [] : null } },
    strictTransportSecurity: config.production ? { maxAge: 31536000 } : false,
    referrerPolicy: { policy: 'no-referrer' },
  }));
  app.use((_req, res, next) => { res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()'); next(); });
  // Railway readiness probes use internal HTTP. Expose only a non-sensitive status here.
  app.get('/api/health', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ ok: true }); });
  app.use((req, res, next) => {
    if (req.headers.origin && !config.origins.includes(req.headers.origin)) return res.status(403).json({ error: 'Origem não permitida' });
    if (config.production && !req.secure) return res.status(426).json({ error: 'Use HTTPS para acessar o sistema' });
    next();
  });
  app.use(cors({ origin: config.origins, credentials: true }));
  app.use(express.json({ limit: '64kb' }));
  const api = express.Router();
  api.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  api.use(rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Muitas solicitações. Aguarde um minuto.' } }));
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.use('/auth', authRoutes); api.use('/drivers', drivers); api.use('/deliveries', deliveries);
  api.use('/locations', locations); api.use('/shifts', shifts); api.use('/route', routing); api.use('/geocoding', geocoding);
  app.use('/api', api);
  // Preserve direct endpoints for existing integrations; apply the same protections.
  app.use(api);
  if (config.production) {
    const frontend = path.resolve(__dirname, '../frontend/dist');
    if (!existsSync(path.join(frontend, 'index.html'))) throw new Error('Execute o build do frontend antes de iniciar em produção');
    app.use(express.static(frontend, { index: false }));
    app.get('/', (_req, res) => res.sendFile(path.join(frontend, 'index.html')));
  }
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.issues.map(({ path, message }) => ({ path, message })) });
    if (err?.code === 'P2002') return res.status(409).json({ error: 'Registro já existe' });
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Registro não encontrado' });
    if (err?.status === 400 || err?.status === 409) return res.status(err.status).json({ error: err.status === 400 ? 'Dados inválidos. Confira os campos.' : err.message });
    if (err?.status === 413) return res.status(413).json({ error: 'Solicitação muito grande' });
    if (err?.code === 'P2034') return res.status(409).json({ error: 'Os dados mudaram. Atualize e tente novamente.' });
    // Do not log request bodies, credentials or provider URLs.
    console.error('Falha interna na API', err?.code ?? err?.name ?? 'unknown');
    res.status(500).json({ error: 'Erro interno' });
  });
  return app;
}

