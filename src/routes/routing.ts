import { Router } from 'express';
import { z } from 'zod';
import type { Response } from 'express';
import { auth } from '../auth';
import { config } from '../config';
import { prisma } from '../prisma';
export const routing = Router();
routing.use(auth);
const latitude = z.coerce.number().min(-90).max(90);
const longitude = z.coerce.number().min(-180).max(180);
const providerResponse = z.object({ routes: z.array(z.object({
  distance: z.number().nonnegative(), duration: z.number().nonnegative(),
  geometry: z.object({ coordinates: z.array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])).min(2) }),
})).optional() });
async function sendRoute(res: Response, fromLat: number, fromLng: number, toLat: number, toLng: number) {
  if (!config.mapboxToken) return res.status(503).json({ error: 'Trajeto por ruas indisponível: MAPBOX_TOKEN não configurado. Use Google Maps ou Waze.' });
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${fromLng},${fromLat};${toLng},${toLat}`);
  url.search = new URLSearchParams({ geometries: 'geojson', overview: 'full', access_token: config.mapboxToken }).toString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return res.status(502).json({ error: 'Falha no serviço de rotas. Use a navegação externa.' });
    const data = providerResponse.parse(await response.json());
    const route = data.routes?.[0];
    if (!route) return res.status(404).json({ error: 'Trajeto não encontrado. Use a navegação externa.' });
    return res.json({ coords: route.geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng })), distanceM: Math.round(route.distance), durationS: Math.round(route.duration) });
  } catch { return res.status(502).json({ error: 'Serviço de rotas indisponível. Use Google Maps ou Waze.' }); }
}
routing.get('/status', (_req, res) => res.json({ roadRoutesAvailable: Boolean(config.mapboxToken), tilesEnabled: process.env.MAP_TILES_ENABLED !== 'false' }));
routing.get('/delivery/:id', async (req, res) => {
  const { fromLat, fromLng } = z.object({ fromLat: latitude, fromLng: longitude }).parse(req.query);
  const delivery = await prisma.delivery.findFirst({ where: { id: String(req.params.id), ...(req.user!.role === 'DRIVER' ? { driverId: req.user!.id } : {}) }, select: { lat: true, lng: true } });
  if (!delivery) return res.status(404).json({ error: 'Entrega não encontrada' });
  return sendRoute(res, fromLat, fromLng, delivery.lat, delivery.lng);
});
// Existing coordinate-based endpoint kept for integrations. Both endpoints require auth.
routing.get('/', async (req, res) => {
  const q = z.object({ fromLat: latitude, fromLng: longitude, toLat: latitude, toLng: longitude }).parse(req.query);
  return sendRoute(res, q.fromLat, q.fromLng, q.toLat, q.toLng);
});
