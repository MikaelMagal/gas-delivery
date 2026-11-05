import type { Request, Response } from 'express';
import { config } from './config';
export const sessionCookie = config.production ? '__Host-gas_session' : 'gas_session';
export function cookieToken(header?: string): string | undefined {
  return header?.split(';').map(v => v.trim()).find(v => v.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length + 1);
}
const options = { httpOnly: true, secure: config.production, sameSite: 'strict' as const, path: '/' };
export function setSessionCookie(res: Response, token: string) { res.cookie(sessionCookie, token, { ...options, maxAge: 12 * 60 * 60 * 1000 }); }
export function clearSessionCookie(res: Response) { res.clearCookie(sessionCookie, options); }
export function requestToken(req: Request): string | undefined {
  return req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : cookieToken(req.headers.cookie);
}
