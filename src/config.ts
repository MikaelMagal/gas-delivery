function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ${name} não definida`);
  return value;
}
const production = process.env.NODE_ENV === 'production';
const jwtSecret = required('JWT_SECRET');
const publicOrigin = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined;
const configuredOrigins = process.env.APP_ORIGINS || publicOrigin;
const origins = (configuredOrigins ?? 'http://localhost:5173,http://localhost:3333').split(',').map(v => v.trim()).filter(Boolean);
if (production && (jwtSecret.length < 32 || /troque|change|secret|exemplo|example|substitua|segredo|placeholder/i.test(jwtSecret))) throw new Error('Configure um JWT_SECRET aleatório de pelo menos 32 caracteres para produção');
if (production && (!configuredOrigins || origins.some(origin => !origin.startsWith('https://')))) throw new Error('Configure APP_ORIGINS com as origens HTTPS públicas');
for (const origin of origins) { if (new URL(origin).origin !== origin) throw new Error('APP_ORIGINS deve conter origens sem caminho ou barra final'); }
const deliveryRadiusM = Number(process.env.DELIVERY_RADIUS_M ?? 150);
if (!Number.isFinite(deliveryRadiusM) || deliveryRadiusM <= 0) throw new Error('DELIVERY_RADIUS_M inválido');
export const config = {
  production, origins, jwtSecret, deliveryRadiusM,
  host: process.env.HOST ?? '127.0.0.1',
  port: Number(process.env.PORT ?? 3333),
  mapboxToken: process.env.MAPBOX_TOKEN ?? '',
  trustProxy: process.env.TRUST_PROXY === '1' ? 1 : process.env.TRUST_PROXY || false,
};


