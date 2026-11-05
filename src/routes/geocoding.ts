import { Router } from 'express';
import { z } from 'zod';
import { auth, requireRole } from '../auth';

export const geocoding = Router();
geocoding.use(auth, requireRole('ADMIN'));
const resultSchema = z.object({ results: z.array(z.object({
  formatted: z.string(), lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180),
})) });
let nextRequestAt = 0;
const cache = new Map<string, { expires: number; results: { address: string; lat: number; lng: number }[] }>();
geocoding.get('/', async (req, res) => {
  const { address } = z.object({ address: z.string().trim().min(5).max(300) }).parse(req.query);
  const key = process.env.GEOAPIFY_API_KEY;
  if (!key) return res.status(503).json({ error: 'Busca por endereço ainda não configurada. Configure GEOAPIFY_API_KEY no servidor ou use coordenadas manuais.' });
  const normalized = address.toLocaleLowerCase('pt-BR');
  const cached = cache.get(normalized);
  if (cached && cached.expires > Date.now()) return res.json(cached.results);
  // Shared by all admins in this server process; no per-keystroke requests.
  if (Date.now() < nextRequestAt) return res.status(429).json({ error: 'Aguarde um instante antes de buscar novamente.' });
  nextRequestAt = Date.now() + 1000;
  const url = new URL('https://api.geoapify.com/v1/geocode/search');
  url.search = new URLSearchParams({ text: address, format: 'json', lang: 'pt', filter: 'countrycode:br', limit: '5', apiKey: key }).toString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return res.status(response.status === 429 ? 429 : 502).json({ error: response.status === 429 ? 'Limite do serviço de endereços atingido. Tente mais tarde ou use coordenadas manuais.' : 'Serviço de endereços indisponível. Tente mais tarde ou use coordenadas manuais.' });
    const data = resultSchema.parse(await response.json());
    const results = data.results.map(r => ({ address: r.formatted, lat: r.lat, lng: r.lon }));
    if (cache.size >= 500) cache.delete(cache.keys().next().value!);
    cache.set(normalized, { expires: Date.now() + 86400000, results });
    res.json(results);
  } catch {
    res.status(502).json({ error: 'Não foi possível consultar o serviço de endereços. Tente novamente ou use coordenadas manuais.' });
  }
});
