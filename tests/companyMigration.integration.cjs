const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const container = 'gas-tenant-validation-20261106';
const database = 'upgrade_' + Date.now();
function docker(args, input) {
  const result = spawnSync('docker', ['exec', '-i', container, ...args], { input, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); return result.stdout;
}
function sql(text) { return docker(['psql', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-tA'], text); }
test('migration preserves existing users, deliveries, shifts, GPS and audit in initial company', () => {
  docker(['createdb', '-U', 'postgres', database]);
  try {
    for (const migration of ['20261105131938_init', '20261105220000_delivery_changes']) sql(readFileSync(`prisma/migrations/${migration}/migration.sql`, 'utf8'));
    sql(`INSERT INTO "User" (id,name,email,"passwordHash",role) VALUES ('a','Admin','legacy@example.com','unchanged-hash','ADMIN'),('d','Driver','legacy-driver@example.com','driver-hash','DRIVER');
      INSERT INTO "Delivery" (id,"customerName",address,lat,lng,product,"driverId","updatedAt",status,"deliveredAt") VALUES ('old','Client','Street 123',1,2,'Gas','d',NOW(),'DELIVERED','2026-11-05 12:00:00');
      INSERT INTO "Shift" (id,"driverId") VALUES ('shift','d');
      INSERT INTO "Location" ("driverId",lat,lng) VALUES ('d',1,2);
      INSERT INTO "DeliveryChange" (id,"deliveryId","actorId",action,before,after) VALUES ('audit','old','a','EDIT','{"quantity":1}','{"quantity":2}');`);
    sql(readFileSync('prisma/migrations/20261106090000_companies/migration.sql', 'utf8'));
    for (const table of ['User', 'Delivery', 'Shift', 'Location', 'DeliveryChange']) assert.equal(sql(`SELECT count(*) FROM "${table}" WHERE "companyId" IS DISTINCT FROM 'initial-company';`).trim(), '0');
    assert.equal(sql(`SELECT "passwordHash" FROM "User" WHERE id='a';`).trim(), 'unchanged-hash');
    assert.equal(sql(`SELECT status::text || '|' || "driverId" FROM "Delivery" WHERE id='old';`).trim(), 'DELIVERED|d');
    assert.equal(sql(`SELECT after->>'quantity' FROM "DeliveryChange" WHERE id='audit';`).trim(), '2');
  } finally { docker(['dropdb', '-U', 'postgres', database]); }
});
