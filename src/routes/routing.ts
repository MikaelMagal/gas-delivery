import { Router } from 'express';
import { z } from 'zod';
import { auth } from '../auth';
import { config } from '../config';

export const routing = Router();
routing.use(auth);

// GET /route?fromLat=..&fromLng=..&toLat=..&toLng=..
// A chave do Mapbox fica só no servidor; o app recebe a linha pronta para o <Polyline>.
routing.get('/', async (req, res) => {
  const q = z
    .object({
      fromLat: z.coerce.number(),
      fromLng: z.coerce.number(),
      toLat: z.coerce.number(),
      toLng: z.coerce.number(),
    })
    .parse(req.query);

  if (!config.mapboxToken) return res.status(503).json({ error: 'MAPBOX_TOKEN não configurado' });

  // Mapbox usa a ordem lng,lat
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${q.fromLng},${q.fromLat};${q.toLng},${q.toLat}` +
    `?geometries=geojson&overview=full&access_token=${config.mapboxToken}`;

  const r = await fetch(url);
  if (!r.ok) return res.status(502).json({ error: 'Falha ao consultar o serviço de rotas' });

  const data = (await r.json()) as {
    routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
  };
  const best = data.routes?.[0];
  if (!best) return res.status(404).json({ error: 'Rota não encontrada' });

  res.json({
    coords: best.geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
    distanceM: Math.round(best.distance),
    durationS: Math.round(best.duration),
  });
});
