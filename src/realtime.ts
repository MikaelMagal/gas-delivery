import { decode } from 'jsonwebtoken';
import { config } from './config';
import { cookieToken } from './session';
import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { authenticateToken } from './auth';

let io: Server;

export function initRealtime(httpServer: HttpServer) {
  io = new Server(httpServer, { cors: { origin: config.origins, credentials: true }, allowRequest: (req, callback) => callback(null, !req.headers.origin || config.origins.includes(req.headers.origin)) });

  // O cliente conecta enviando { auth: { token } }
  io.use(async (socket, next) => {
    try {
      const token = String(cookieToken(socket.request.headers.cookie) ?? socket.handshake.auth?.token ?? '');
      const user = await authenticateToken(token);
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = user;
      const claims = decode(token);
      socket.data.expiresAt = claims && typeof claims === 'object' && typeof claims.exp === 'number' ? claims.exp * 1000 : Date.now();
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as { id: string; role: string };
    if (user.role === 'ADMIN') socket.join('admins');
    else socket.join(`driver:${user.id}`);
    const expires = setTimeout(() => socket.disconnect(true), Math.max(0, socket.data.expiresAt - Date.now()));
    socket.on('disconnect', () => clearTimeout(expires));
  });
}

export const emitToAdmins = (event: string, payload: unknown) => io.to('admins').emit(event, payload);
export const emitToDriver = (driverId: string, event: string, payload: unknown) =>
  io.to(`driver:${driverId}`).emit(event, payload);

export function disconnectDriver(driverId: string) { io?.in(`driver:${driverId}`).disconnectSockets(true); }



