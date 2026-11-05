import { Router } from 'express';
import { prisma } from '../prisma';
import { auth, requireRole } from '../auth';
import { emitToAdmins, emitToDriver } from '../realtime';

export const shifts = Router();
shifts.use(auth, requireRole('DRIVER'));

shifts.get('/current', async (req, res) => {
  const shift = await prisma.shift.findFirst({ where: { driverId: req.user!.id, endedAt: null }, orderBy: { startedAt: 'desc' } });
  res.json(shift);
});

// Motoboy inicia o turno (o app só envia localização com turno aberto)
shifts.post('/start', async (req, res) => {
  const driverId = req.user!.id;
  const { open, shift } = await prisma.$transaction(async tx => {
    const open = await tx.shift.findFirst({ where: { driverId, endedAt: null } });
    const shift = open ?? (await tx.shift.create({ data: { driverId } }));
    return { open, shift };
  }, { isolationLevel: 'Serializable' });
  emitToAdmins('driver:shift', { driverId, active: true });
  emitToDriver(driverId, 'driver:shift', { driverId, active: true });
  res.status(open ? 200 : 201).json(shift);
});

shifts.post('/end', async (req, res) => {
  const driverId = req.user!.id;
  await prisma.$transaction([
    prisma.shift.updateMany({ where: { driverId, endedAt: null }, data: { endedAt: new Date() } }),
    prisma.delivery.updateMany({ where: { driverId, status: 'EN_ROUTE' }, data: { status: 'PENDING' } }),
  ], { isolationLevel: 'Serializable' });
  emitToAdmins('driver:shift', { driverId, active: false });
  emitToDriver(driverId, 'driver:shift', { driverId, active: false });
  res.status(204).end();
});




