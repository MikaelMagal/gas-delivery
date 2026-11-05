import { requestToken } from './session';
import jwt from 'jsonwebtoken';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@prisma/client';
import { config } from './config';
import { prisma } from './prisma';
export type AuthUser = { id: string; role: Role };
declare global { namespace Express { interface Request { user?: AuthUser } } }
export function credentialFor(passwordHash: string): string {
  return createHmac('sha256', config.jwtSecret).update(passwordHash).digest('hex');
}
export function signToken(user: AuthUser, passwordHash: string): string {
  return jwt.sign({ id: user.id, role: user.role, credential: credentialFor(passwordHash) }, config.jwtSecret, { expiresIn: '12h' });
}
export function verifyToken(token: string): AuthUser & { credential: string } {
  const p = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  if (typeof p === 'string' || typeof p.id !== 'string' || !['ADMIN', 'DRIVER'].includes(p.role) || typeof p.credential !== 'string') throw new Error('Invalid token');
  return { id: p.id, role: p.role, credential: p.credential };
}
export async function authenticateToken(token: string): Promise<AuthUser | null> {
  let claims;
  try { claims = verifyToken(token); } catch { return null; }
  const user = await prisma.user.findUnique({ where: { id: claims.id }, select: { id: true, role: true, active: true, passwordHash: true } });
  if (!user?.active || user.role !== claims.role) return null;
  const expected = Buffer.from(credentialFor(user.passwordHash));
  const supplied = Buffer.from(claims.credential);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  return { id: user.id, role: user.role };
}
export async function auth(req: Request, res: Response, next: NextFunction) {
  const token = requestToken(req);
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    const user = await authenticateToken(token);
    if (!user) return res.status(401).json({ error: 'Sessão inválida ou expirada. Entre novamente.' });
    req.user = user;
    next();
  } catch (err) { next(err); }
}
export const requireRole = (role: Role) => (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== role) return res.status(403).json({ error: 'Sem permissão' });
  next();
};

