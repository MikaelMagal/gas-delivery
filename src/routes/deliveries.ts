import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { auth, requireRole } from '../auth';
import { config } from '../config';
import { distanceM, startOfToday } from '../utils';
import { emitToAdmins, emitToDriver } from '../realtime';

export const deliveries = Router();
deliveries.use(auth);

// Mostra o que foi criado hoje + o que ainda está aberto (não perde pendências de ontem)
const visibleNow = () => ({
  OR: [{ createdAt: { gte: startOfToday() } }, { status: { in: ['PENDING', 'EN_ROUTE'] as ('PENDING' | 'EN_ROUTE')[] } }],
});

const createSchema = z.object({
  customerName: z.string().min(1),
  phone: z.string().optional(),
  address: z.string().min(5),
  lat: z.number().min(-90).max(90),   // vem da geocodificação feita no painel
  lng: z.number().min(-180).max(180),
  product: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  notes: z.string().optional(),
  driverId: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().default(0),
});

// ADMIN: cria entrega (opcionalmente já atribuída a um motoboy)
deliveries.post('/', requireRole('ADMIN'), async (req, res) => {
  const data = createSchema.parse(req.body);
  const d = await prisma.$transaction(async tx => {
    if (data.driverId) {
      const driver = await tx.user.findFirst({ where: { id: data.driverId, role: 'DRIVER', active: true }, select: { id: true } });
      if (!driver) throw Object.assign(new Error('Selecione um motoboy ativo válido'), { status: 400 });
    }
    return tx.delivery.create({ data });
  }, { isolationLevel: 'Serializable' });
  if (d.driverId) emitToDriver(d.driverId, 'delivery:assigned', d);
  emitToAdmins('delivery:updated', d);
  res.status(201).json(d);
});

// ADMIN: lista entregas (filtro opcional por motoboy)
deliveries.get('/', requireRole('ADMIN'), async (req, res) => {
  const { driverId } = z.object({ driverId: z.string().optional() }).parse(req.query);
  const list = await prisma.delivery.findMany({
    where: { driverId, ...visibleNow() },
    orderBy: [{ driverId: 'asc' }, { sortOrder: 'asc' }],
    include: { driver: { select: { id: true, name: true } } },
  });
  res.json(list);
});

// DRIVER: minhas paradas (precisa vir antes de '/:id')
deliveries.get('/mine', requireRole('DRIVER'), async (req, res) => {
  const list = await prisma.delivery.findMany({
    where: { driverId: req.user!.id, status: { not: 'CANCELED' }, ...visibleNow() },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  res.json(list);
});

// ADMIN: edita, reatribui, reordena ou cancela
deliveries.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const data = createSchema
    .partial()
    .extend({ status: z.enum(['PENDING', 'CANCELED']).optional() })
    .parse(req.body);
  const id = String(req.params.id);
  const d = await prisma.$transaction(async (tx) => {
    if (data.driverId !== undefined) {
      const driver = await tx.user.findFirst({ where: { id: data.driverId, role: 'DRIVER', active: true }, select: { id: true } });
      if (!driver) throw Object.assign(new Error('Selecione um motoboy ativo válido'), { status: 400 });
      // Conditional write also protects against a driver starting/completing this delivery concurrently.
      const changed = await tx.delivery.updateMany({ where: { id, status: 'PENDING' }, data });
      if (!changed.count) return null;
      return tx.delivery.findUniqueOrThrow({ where: { id } });
    }
    return tx.delivery.update({ where: { id }, data });
  }, { isolationLevel: 'Serializable' });
  if (!d) {
    const exists = await prisma.delivery.findUnique({ where: { id }, select: { id: true } });
    return res.status(exists ? 409 : 404).json({ error: exists ? 'Só é possível atribuir motoboy a entregas pendentes' : 'Entrega não encontrada' });
  }
  if (d.driverId) emitToDriver(d.driverId, 'delivery:assigned', d);
  emitToAdmins('delivery:updated', d);
  res.json(d);
});

const findOwn = (id: string, driverId: string) => prisma.delivery.findFirst({ where: { id, driverId } });

// DRIVER: escolheu esta parada ("Ir para esta parada")
deliveries.post('/:id/start', requireRole('DRIVER'), async (req, res) => {
  const driverId = req.user!.id;
  const d = await findOwn(String(req.params.id), driverId);
  if (!d) return res.status(404).json({ error: 'Entrega não encontrada' });
  if (d.status === 'DELIVERED' || d.status === 'CANCELED') {
    return res.status(409).json({ error: 'Entrega já finalizada' });
  }

  const updated = await prisma.$transaction(async tx => {
    const shift = await tx.shift.findFirst({ where: { driverId, endedAt: null } });
    if (!shift) throw Object.assign(new Error('Inicie o turno antes de iniciar a rota'), { status: 409 });
    await tx.delivery.updateMany({ where: { driverId, status: 'EN_ROUTE', NOT: { id: d.id } }, data: { status: 'PENDING' } });
    const changed = await tx.delivery.updateMany({ where: { id: d.id, driverId, status: { in: ['PENDING', 'EN_ROUTE'] } }, data: { status: 'EN_ROUTE' } });
    if (!changed.count) throw Object.assign(new Error('A entrega mudou. Atualize sua lista.'), { status: 409 });
    return tx.delivery.findUniqueOrThrow({ where: { id: d.id } });
  }, { isolationLevel: 'Serializable' });
  emitToAdmins('delivery:updated', updated);
  res.json(updated);
});

// DRIVER: confirmation is idempotent and ownership is checked inside the transaction.
deliveries.post('/:id/complete', requireRole('DRIVER'), async (req, res) => {
  const { lat, lng } = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), force: z.literal(false).optional() }).parse(req.body);
  const driverId = req.user!.id;
  const id = String(req.params.id);
  const result = await prisma.$transaction(async tx => {
    const delivery = await tx.delivery.findFirst({ where: { id, driverId } });
    if (!delivery) return { kind: 'missing' as const };
    if (delivery.status === 'DELIVERED') {
      // Retrying a confirmed stop must never start or skip another stop.
      const nextDelivery = await tx.delivery.findFirst({ where: { driverId, status: 'EN_ROUTE' } });
      return { kind: 'ok' as const, delivery, nextDelivery };
    }
    if (delivery.status !== 'EN_ROUTE') return { kind: 'conflict' as const };
    const shift = await tx.shift.findFirst({ where: { driverId, endedAt: null } });
    if (!shift) return { kind: 'shift' as const };
    const distance = Math.round(distanceM(lat, lng, delivery.lat, delivery.lng));
    if (distance > config.deliveryRadiusM) return { kind: 'distance' as const, distance };
    const changed = await tx.delivery.updateMany({ where: { id, driverId, status: 'EN_ROUTE' }, data: {
      status: 'DELIVERED', deliveredAt: new Date(), deliveredLat: lat, deliveredLng: lng, deliveredDistanceM: distance,
    } });
    if (!changed.count) return { kind: 'conflict' as const };
    const completedDelivery = await tx.delivery.findUniqueOrThrow({ where: { id } });
    let nextDelivery = await tx.delivery.findFirst({ where: { driverId, status: 'EN_ROUTE' } });
    if (!nextDelivery) {
      const pending = await tx.delivery.findFirst({
        where: { driverId, status: 'PENDING' },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      if (pending) {
        const started = await tx.delivery.updateMany({ where: { id: pending.id, driverId, status: 'PENDING' }, data: { status: 'EN_ROUTE' } });
        if (!started.count) throw Object.assign(new Error('A próxima parada mudou. Atualize e tente novamente.'), { status: 409 });
        nextDelivery = await tx.delivery.findUniqueOrThrow({ where: { id: pending.id } });
      }
    }
    return { kind: 'ok' as const, delivery: completedDelivery, nextDelivery };
  }, { isolationLevel: 'Serializable' });
  if (result.kind === 'missing') return res.status(404).json({ error: 'Entrega não encontrada' });
  if (result.kind === 'conflict') return res.status(409).json({ error: 'Selecione esta entrega como parada em rota antes de confirmar. Atualize a lista.' });
  if (result.kind === 'shift') return res.status(409).json({ error: 'Inicie o turno antes de confirmar a entrega.' });
  if (result.kind === 'distance') return res.status(422).json({ error: `Você está a ${result.distance} m do destino. Aproxime-se do endereço ou solicite ao administrador a revisão da localização.`, distanceM: result.distance });
  emitToAdmins('delivery:updated', result.delivery);
  if (result.nextDelivery) emitToAdmins('delivery:updated', result.nextDelivery);
  res.json({ ...result.delivery, nextDelivery: result.nextDelivery });
});

