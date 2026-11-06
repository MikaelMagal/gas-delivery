import { tenantId } from '../tenant';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { auth, requireRole } from '../auth';
import { startOfToday } from '../utils';
import { emitToAdmins } from '../realtime';

export const locations = Router();
locations.use(auth);

const point = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speed: z.number().optional(),
  recordedAt: z.coerce.date().optional(),
});

// DRIVER: envia 1 ponto ou um lote (lote = sincronizaÃ§Ã£o depois de ficar sem internet)
locations.post('/', requireRole('DRIVER'), async (req, res) => {
  const body = z.union([point, z.array(point).min(1).max(500)]).parse(req.body);
  const points = Array.isArray(body) ? body : [body];
  const driverId = req.user!.id;

  await prisma.location.createMany({
    data: points.map((p) => ({
      driverId, companyId: tenantId(),
      lat: p.lat,
      lng: p.lng,
      speed: p.speed,
      recordedAt: p.recordedAt ?? new Date(),
    })),
  });

  // avisa o painel sÃ³ com o ponto mais recente
  const last = points[points.length - 1];
  emitToAdmins('driver:location', {
    driverId,
    lat: last.lat,
    lng: last.lng,
    speed: last.speed ?? null,
    recordedAt: (last.recordedAt ?? new Date()).toISOString(),
  });
  res.status(204).end();
});

// ADMIN: trajeto percorrido (para desenhar a linha pontilhada)
locations.get('/:driverId/trail', requireRole('ADMIN'), async (req, res) => {
  const { since } = z.object({ since: z.coerce.date().optional() }).parse(req.query);
  const points = await prisma.location.findMany({
    where: { driverId: String(req.params.driverId), recordedAt: { gte: since ?? startOfToday() } },
    orderBy: { recordedAt: 'asc' },
    select: { lat: true, lng: true, recordedAt: true },
  });
  res.json(points);
});
