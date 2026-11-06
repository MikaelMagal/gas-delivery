// Read-only diagnostics. Never prints environment values or provider errors.
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const email = (process.env.PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD || '';
  console.log(JSON.stringify({ databaseConfigured: !!process.env.DATABASE_URL, validPlatformEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), validPasswordLength: password.length >= 12 && Buffer.byteLength(password, 'utf8') <= 72, updatedClient: !!db.company }));
  try {
    const tables = await db.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('Company','User','Delivery')`;
    console.log(JSON.stringify({ tables: tables.map(t => t.table_name) }));
    if (!db.company || !tables.some(t => t.table_name === 'Company')) return;
    console.log(JSON.stringify({ companies: await db.company.count(), users: await db.user.count(), deliveries: await db.delivery.count(), emailAlreadyRegistered: !!email && !!await db.user.findUnique({ where: { email }, select: { id: true } }), globalAccounts: await db.user.count({ where: { role: 'PLATFORM_ADMIN' } }) }));
  } catch (e) { console.log(JSON.stringify({ errorCode: e.code || null, errorType: e.name })); process.exitCode = 1; }
})().finally(() => db.$disconnect());
