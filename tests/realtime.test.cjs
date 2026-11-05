const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'socket-integration-secret';
const { io: client } = require('../frontend/node_modules/socket.io-client');
const { prisma } = require('../dist/prisma');
const { signToken, credentialFor } = require('../dist/auth');
const { initRealtime, publishDeliveryChange, disconnectDriver } = require('../dist/realtime');
function event(socket, name, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, callback); reject(new Error(`Timeout: ${name}`)); }, timeout);
    function callback(...args) { clearTimeout(timer); resolve(args); }
    socket.once(name, callback);
  });
}
test('live sockets: cookie auth, room isolation, reassignment, revocation and expiration', async () => {
  const users = {
    admin: { id: 'admin', role: 'ADMIN', active: true, passwordHash: 'hash' },
    a: { id: 'a', role: 'DRIVER', active: true, passwordHash: 'hash' },
    b: { id: 'b', role: 'DRIVER', active: true, passwordHash: 'hash' },
  };
  prisma.user.findUnique = async ({ where }) => users[where.id] || null;
  const server = http.createServer();
  const sockets = initRealtime(server);
  server.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  function make(token, origin = 'http://localhost:5173') {
    const socket = client(base, { autoConnect: false, transports: ['websocket'], reconnection: false, extraHeaders: { Origin: origin, ...(token ? { Cookie: `gas_session=${token}` } : {}) } });
    clients.push(socket); return socket;
  }
  async function connect(socket) { const connected = event(socket, 'connect'); socket.connect(); await connected; }
  try {
    const unauthorized = make(); const rejection = event(unauthorized, 'connect_error'); unauthorized.connect(); assert.equal((await rejection)[0].message, 'unauthorized');
    const wrongOrigin = make(signToken(users.a, 'hash'), 'https://evil.example'); const blocked = event(wrongOrigin, 'connect_error'); wrongOrigin.connect(); await blocked; assert.equal(wrongOrigin.connected, false);
    const admin = make(signToken(users.admin, 'hash')), a = make(signToken(users.a, 'hash')), b = make(signToken(users.b, 'hash'));
    await Promise.all([connect(admin), connect(a), connect(b)]);
    const aEvents = [], bEvents = [];
    a.on('delivery:updated', payload => aEvents.push(payload)); b.on('delivery:updated', payload => bEvents.push(payload));
    const firstAdmin = event(admin, 'delivery:updated'), firstA = event(a, 'delivery:updated');
    publishDeliveryChange({ id: 'delivery', driverId: 'a' });
    await Promise.all([firstAdmin, firstA]);
    assert.deepEqual(aEvents, [{ id: 'delivery' }]); assert.deepEqual(bEvents, []);
    const switched = [event(admin, 'delivery:updated'), event(a, 'delivery:updated'), event(b, 'delivery:updated')];
    publishDeliveryChange({ id: 'delivery', driverId: 'b' }, 'a');
    await Promise.all(switched);
    assert.deepEqual(aEvents[1], { id: 'delivery' }); assert.deepEqual(bEvents[0], { id: 'delivery' });
    const disconnected = event(a, 'disconnect');
    users.a.passwordHash = 'changed-hash'; disconnectDriver('a');
    assert.equal((await disconnected)[0], 'io server disconnect');
    const stale = event(a, 'connect_error'); a.connect(); assert.equal((await stale)[0].message, 'unauthorized');
    const shortToken = jwt.sign({ id: 'b', role: 'DRIVER', credential: credentialFor('hash') }, process.env.JWT_SECRET, { expiresIn: '2s' });
    const expiring = make(shortToken); await connect(expiring);
    assert.equal((await event(expiring, 'disconnect', 4000))[0], 'io server disconnect');
    users.b.active = false;
    const disabled = make(signToken(users.b, 'hash')); const denied = event(disabled, 'connect_error'); disabled.connect(); assert.equal((await denied)[0].message, 'unauthorized');
  } finally {
    clients.forEach(socket => socket.disconnect());
    await new Promise(resolve => sockets.close(resolve));
    await prisma.$disconnect();
  }
});
