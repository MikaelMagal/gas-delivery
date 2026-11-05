import { disconnectDriver } from '../realtime';
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma';
import { auth, requireRole } from '../auth';

export const drivers = Router();
drivers.use(auth, requireRole('ADMIN'));

// Cadastra um motoboy
drivers.post('/', async (req, res) => {
  const d = z
    .object({ name: z.string().trim().min(1), email: z.string().trim().email(), password: z.string().min(6).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Senha muito longa; use menos caracteres.') })
    .parse(req.body);

  const user = await prisma.user.create({
    data: {
      name: d.name,
      email: d.email.toLowerCase(),
      passwordHash: await bcrypt.hash(d.password, 10),
      role: 'DRIVER',
    },
    select: { id: true, name: true, email: true },
  });
  res.status(201).json(user);
});

// Lista motoboys com a última posição conhecida e se há turno aberto
drivers.get('/', async (_req, res) => {
  const list = await prisma.user.findMany({
    where: { role: 'DRIVER', active: true },
    select: {
      id: true,
      name: true,
      locations: { orderBy: { recordedAt: 'desc' }, take: 1, select: { lat: true, lng: true, recordedAt: true } },
      shifts: { where: { endedAt: null }, take: 1, select: { id: true, startedAt: true } },
    },
  });

  res.json(
    list.map((u) => ({
      id: u.id,
      name: u.name,
      lastLocation: u.locations[0] ?? null,
      onShift: u.shifts.length > 0,
    })),
  );
});


// Removal preserves delivery, shift and location history.
drivers.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  const result = await prisma.$transaction(async tx => {
    const driver = await tx.user.findFirst({ where: { id, role: 'DRIVER', active: true }, select: { id: true } });
    if (!driver) return 'missing';
    const open = await tx.shift.findFirst({ where: { driverId: id, endedAt: null }, select: { id: true } });
    const delivery = await tx.delivery.findFirst({ where: { driverId: id, status: { in: ['PENDING', 'EN_ROUTE'] } }, select: { id: true } });
    if (open || delivery) return 'busy';
    await tx.user.update({ where: { id }, data: { active: false }, select: { id: true } });
    return 'ok';
  }, { isolationLevel: 'Serializable' });
  if (result === 'missing') return res.status(404).json({ error: 'Motoboy ativo não encontrado' });
  if (result === 'busy') return res.status(409).json({ error: 'Encerre o turno e reatribua ou finalize as entregas abertas antes de remover o motoboy.' });
  disconnectDriver(id);
  res.status(204).end();
});

drivers.patch('/:id/password', async (req, res) => {
  const { password } = z.object({ password: z.string().min(6).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Senha muito longa; use menos caracteres.') }).parse(req.body);
  const id = String(req.params.id);
  const passwordHash = await bcrypt.hash(password, 10);
  const changed = await prisma.user.updateMany({ where: { id, role: 'DRIVER', active: true }, data: { passwordHash } });
  if (!changed.count) return res.status(404).json({ error: 'Motoboy ativo não encontrado' });
  disconnectDriver(id);
  res.status(204).end();
});

