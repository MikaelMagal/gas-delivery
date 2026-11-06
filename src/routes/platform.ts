import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { auth, requireRole, signToken } from '../auth';
import { systemPrisma as db } from '../prisma';
import { setSessionCookie } from '../session';
import { disconnectDriver, disconnectCompany } from '../realtime';

export const platform = Router();
platform.use(auth, requireRole('PLATFORM_ADMIN'));
const password = z.string().min(12).refine(v => Buffer.byteLength(v, 'utf8') <= 72);
const administrator = z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(254), password });
platform.get('/companies', async (_req, res) => {
  res.json(await db.company.findMany({ orderBy: { createdAt: 'asc' }, include: { users: { where: { role: 'ADMIN' }, select: { id: true, name: true, email: true, active: true } } } }));
});
platform.post('/companies', async (req, res) => {
  const input = z.object({ name: z.string().trim().min(1).max(160), admin: administrator }).strict().parse(req.body);
  const hash = await bcrypt.hash(input.admin.password, 10);
  const company = await db.$transaction(async tx => {
    const company = await tx.company.create({ data: { name: input.name } });
    await tx.user.create({ data: { companyId: company.id, name: input.admin.name, email: input.admin.email.toLowerCase(), passwordHash: hash, role: 'ADMIN' } });
    return company;
  });
  res.status(201).json(company);
});
platform.post('/companies/:id/admins', async (req, res) => {
  const input = administrator.strict().parse(req.body);
  const companyId = String(req.params.id);
  if (!await db.company.findFirst({ where: { id: companyId, active: true } })) return res.status(404).json({ error: 'Empresa ativa não encontrada' });
  const user = await db.user.create({ data: { companyId, name: input.name, email: input.email.toLowerCase(), passwordHash: await bcrypt.hash(input.password, 10), role: 'ADMIN' }, select: { id: true, name: true, email: true } });
  res.status(201).json(user);
});
platform.patch('/admins/:id', async (req, res) => {
  const input = z.object({ active: z.boolean().optional(), password: password.optional(), email: z.string().trim().email().max(254).optional() }).strict().refine(v => Object.keys(v).length > 0).parse(req.body);
  const id = String(req.params.id);
  const result = await db.user.updateMany({ where: { id, role: 'ADMIN' }, data: { ...(input.email ? { email: input.email.toLowerCase() } : {}), ...(input.active !== undefined ? { active: input.active } : {}), ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 10) } : {}) } });
  if (!result.count) return res.status(404).json({ error: 'Administrador não encontrado' });
  disconnectDriver(id);
  res.status(204).end();
});
platform.delete('/companies/:id', async (req, res) => {
  const { confirmationName } = z.object({ confirmationName: z.string().min(1).max(160) }).strict().parse(req.body);
  const id = String(req.params.id);
  const users = await db.$transaction(async tx => {
    const company = await tx.company.findUnique({ where: { id } });
    if (!company) return null;
    if (company.active) throw Object.assign(new Error('Desative a empresa antes de removê-la.'), { status: 409 });
    if (company.name !== confirmationName) throw Object.assign(new Error('Digite exatamente o nome da empresa para confirmar a remoção.'), { status: 409 });
    const users = await tx.user.findMany({ where: { companyId: id }, select: { id: true } });
    await tx.deliveryChange.deleteMany({ where: { companyId: id } });
    await tx.location.deleteMany({ where: { companyId: id } });
    await tx.shift.deleteMany({ where: { companyId: id } });
    await tx.delivery.deleteMany({ where: { companyId: id } });
    await tx.user.deleteMany({ where: { companyId: id } });
    await tx.company.delete({ where: { id } });
    return users;
  }, { isolationLevel: 'Serializable' });
  if (!users) return res.status(404).json({ error: 'Empresa não encontrada' });
  disconnectCompany(id);
  for (const user of users) disconnectDriver(user.id);
  res.status(204).end();
});
platform.patch('/companies/:id', async (req, res) => {
  const input = z.object({ active: z.boolean() }).strict().parse(req.body);
  const id = String(req.params.id);
  const changed = await db.company.updateMany({ where: { id }, data: input });
  if (!changed.count) return res.status(404).json({ error: 'Empresa não encontrada' });
  const users = await db.user.findMany({ where: { companyId: id }, select: { id: true } });
  disconnectCompany(id);
  for (const user of users) disconnectDriver(user.id);
  res.status(204).end();
});
// Selected company is signed into a fresh cookie; ordinary admins cannot select one.
platform.post('/access', async (req, res) => {
  const { companyId } = z.object({ companyId: z.string().min(1).nullable() }).strict().parse(req.body);
  if (companyId && !await db.company.findFirst({ where: { id: companyId, active: true } })) return res.status(404).json({ error: 'Empresa ativa não encontrada' });
  const user = await db.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  disconnectDriver(user.id);
  setSessionCookie(res, signToken({ id: user.id, role: 'PLATFORM_ADMIN', companyId }, user.passwordHash));
  const company = companyId ? await db.company.findUnique({ where: { id: companyId }, select: { name: true } }) : null;
  res.json({ user: { id: user.id, name: user.name, role: user.role, companyId, companyName: company?.name } });
});
