import { setSessionCookie, clearSessionCookie } from '../session';
import { rateLimit } from 'express-rate-limit';
import { auth } from '../auth';
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma';
import { signToken } from '../auth';

export const authRoutes = Router();

const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, skipSuccessfulRequests: true, message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' } });
authRoutes.post('/login', loginLimit, async (req, res) => {
  const { email, password } = z
    .object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(256) })
    .parse(req.body);

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  setSessionCookie(res, signToken({ id: user.id, role: user.role }, user.passwordHash));
  res.json({
    user: { id: user.id, name: user.name, role: user.role },
  });
});


authRoutes.post('/logout', (_req, res) => { clearSessionCookie(res); res.status(204).end(); });
authRoutes.get('/me', auth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, name: true, role: true } });
  res.json({ user });
});
