import { reportQuery, reportWindow } from '../deliveryReport';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { auth, requireRole } from '../auth';
import { config } from '../config';
import { distanceM } from '../utils';
import { operationalWindow, byOperationalStatus } from '../deliveryVisibility';
import { publishDeliveryChange } from '../realtime';

export const deliveries = Router();
deliveries.use(auth);

const visibleNow = operationalWindow;

const createSchema = z.object({
  customerName: z.string().trim().min(1),
  phone: z.string().optional(),
  address: z.string().trim().min(5),
  lat: z.number().min(-90).max(90),   // vem da geocodificação feita no painel
  lng: z.number().min(-180).max(180),
  product: z.string().trim().min(1),
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
  publishDeliveryChange(d);
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
  res.json(list.sort(byOperationalStatus));
});

// ADMIN: historical reporting is separate from today's operational list.
deliveries.get('/report', requireRole('ADMIN'), async (req, res) => {
  const query = reportQuery.parse(req.query);
  const window = reportWindow(query.from, query.to);
  const where = {
    [query.dateBy]: window,
    ...(query.status ? { status: query.status } : {}),
    ...(query.driverId ? { driverId: query.driverId } : {}),
    ...(query.search ? { OR: ['customerName', 'address', 'product'].map(field => ({ [field]: { contains: query.search, mode: 'insensitive' as const } })) } : {}),
  };
  const result = await prisma.$transaction(async tx => {
    const total = await tx.delivery.count({ where });
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize)));
    const items = await tx.delivery.findMany({
      where, orderBy: [{ [query.dateBy]: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * query.pageSize, take: query.pageSize,
      include: { driver: { select: { id: true, name: true } } },
    });
    const drivers = await tx.user.findMany({ where: { role: 'DRIVER' }, select: { id: true, name: true, active: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
    return { items, total, drivers, page };
  }, { isolationLevel: 'RepeatableRead' });
  res.json({ ...result, pageSize: query.pageSize, totalPages: Math.ceil(result.total / query.pageSize), timezone: 'UTC-03:00' });
});
// DRIVER: minhas paradas (precisa vir antes de '/:id')
deliveries.get('/mine', requireRole('DRIVER'), async (req, res) => {
  const list = await prisma.delivery.findMany({
    where: { driverId: req.user!.id, status: { not: 'CANCELED' }, ...visibleNow() },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  res.json(list);
});

// ADMIN: audit and the update are committed together; stale forms are rejected.
const snapshot = (value: unknown) => JSON.parse(JSON.stringify(value));
deliveries.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const { expectedUpdatedAt, ...data } = createSchema.omit({ quantity: true, sortOrder: true }).partial().extend({
    quantity: z.number().int().positive().optional(),
    sortOrder: z.number().int().optional(),
    status: z.enum(['PENDING', 'CANCELED']).optional(),
    expectedUpdatedAt: z.string().datetime().optional(),
  }).strict().parse(req.body);
  if (!Object.keys(data).length) return res.status(400).json({ error: 'Informe os campos a alterar' });
  const id = String(req.params.id);
  let previousDriverId: string | null = null;
  const d = await prisma.$transaction(async tx => {
    const before = await tx.delivery.findUnique({ where: { id } });
    if (!before) return null;
    previousDriverId = before.driverId;
    if (expectedUpdatedAt && before.updatedAt.toISOString() !== expectedUpdatedAt) throw Object.assign(new Error('A entrega foi alterada. Feche o formulário, atualize a lista e tente novamente.'), { status: 409 });
    if (data.driverId !== undefined && before.status !== 'PENDING') throw Object.assign(new Error('Só é possível atribuir motoboy a entregas pendentes'), { status: 409 });
    if (data.status && data.status !== before.status && ['DELIVERED', 'CANCELED'].includes(before.status)) throw Object.assign(new Error('Use Reabrir entrega para alterar uma entrega finalizada.'), { status: 409 });
    if (before.status === 'DELIVERED' && ((data.address !== undefined && data.address !== before.address) || (data.lat !== undefined && data.lat !== before.lat) || (data.lng !== undefined && data.lng !== before.lng))) throw Object.assign(new Error('Reabra a entrega antes de alterar o endereço ou a localização do comprovante.'), { status: 409 });
    if (data.address !== undefined && data.address !== before.address && (data.lat === undefined || data.lng === undefined)) throw Object.assign(new Error('Ao alterar o endereço, informe também as coordenadas confirmadas.'), { status: 400 });
    if (data.driverId !== undefined) {
      const driver = await tx.user.findFirst({ where: { id: data.driverId, role: 'DRIVER', active: true }, select: { id: true } });
      if (!driver) throw Object.assign(new Error('Selecione um motoboy ativo válido'), { status: 400 });
    }
    const changed = await tx.delivery.updateMany({ where: { id, updatedAt: before.updatedAt, status: before.status }, data });
    if (!changed.count) throw Object.assign(new Error('A entrega mudou durante a edição. Atualize e tente novamente.'), { status: 409 });
    const after = await tx.delivery.findUniqueOrThrow({ where: { id } });
    await tx.deliveryChange.create({ data: { deliveryId: id, actorId: req.user!.id, action: 'EDIT', before: snapshot(before), after: snapshot(after) } });
    return after;
  }, { isolationLevel: 'Serializable' });
  if (!d) return res.status(404).json({ error: 'Entrega não encontrada' });
  publishDeliveryChange(d, previousDriverId);
  res.json(d);
});

deliveries.post('/:id/reopen', requireRole('ADMIN'), async (req, res) => {
  const { reason, expectedUpdatedAt } = z.object({ reason: z.string().trim().min(5).max(500), expectedUpdatedAt: z.string().datetime().optional() }).strict().parse(req.body);
  const id = String(req.params.id);
  const d = await prisma.$transaction(async tx => {
    const before = await tx.delivery.findUnique({ where: { id } });
    if (!before) return null;
    if (expectedUpdatedAt && before.updatedAt.toISOString() !== expectedUpdatedAt) throw Object.assign(new Error('A entrega foi alterada. Atualize antes de reabrir.'), { status: 409 });
    if (!['DELIVERED', 'CANCELED'].includes(before.status)) throw Object.assign(new Error('Somente entregas concluídas ou canceladas podem ser reabertas.'), { status: 409 });
    const driver = before.driverId ? await tx.user.findFirst({ where: { id: before.driverId, role: 'DRIVER', active: true }, select: { id: true } }) : null;
    const changed = await tx.delivery.updateMany({ where: { id, status: before.status, updatedAt: before.updatedAt }, data: {
      status: 'PENDING', driverId: driver?.id ?? null, deliveredAt: null, deliveredLat: null, deliveredLng: null, deliveredDistanceM: null,
    } });
    if (!changed.count) throw Object.assign(new Error('A entrega mudou. Atualize antes de reabrir.'), { status: 409 });
    const after = await tx.delivery.findUniqueOrThrow({ where: { id } });
    await tx.deliveryChange.create({ data: { deliveryId: id, actorId: req.user!.id, action: 'REOPEN', reason, before: snapshot(before), after: snapshot(after) } });
    return after;
  }, { isolationLevel: 'Serializable' });
  if (!d) return res.status(404).json({ error: 'Entrega não encontrada' });
  publishDeliveryChange(d);
  res.json(d);
});

deliveries.get('/:id/history', requireRole('ADMIN'), async (req, res) => {
  const id = String(req.params.id);
  if (!await prisma.delivery.findUnique({ where: { id }, select: { id: true } })) return res.status(404).json({ error: 'Entrega não encontrada' });
  const changes = await prisma.deliveryChange.findMany({ where: { deliveryId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100, include: { actor: { select: { id: true, name: true } } } });
  const driverIdFrom = (value: unknown): string | null => value && typeof value === 'object' && 'driverId' in value && typeof value.driverId === 'string' ? value.driverId : null;
  const ids = [...new Set(changes.flatMap(change => [driverIdFrom(change.before), driverIdFrom(change.after)]).filter((value): value is string => value !== null))];
  // Include inactive accounts: deactivation must not hide historical responsibility.
  const drivers = ids.length ? await prisma.user.findMany({ where: { id: { in: ids }, role: 'DRIVER' }, select: { id: true, name: true } }) : [];
  const names = new Map(drivers.map(driver => [driver.id, driver.name]));
  res.json(changes.map(change => ({ ...change,
    beforeDriverName: names.get(driverIdFrom(change.before) ?? '') ?? null,
    afterDriverName: names.get(driverIdFrom(change.after) ?? '') ?? null,
  })));
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
  publishDeliveryChange(updated);
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
  publishDeliveryChange(result.delivery);
  if (result.nextDelivery) publishDeliveryChange(result.nextDelivery);
  res.json({ ...result.delivery, nextDelivery: result.nextDelivery });
});







