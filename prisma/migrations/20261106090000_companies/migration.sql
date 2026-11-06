BEGIN;
ALTER TYPE "Role" ADD VALUE 'PLATFORM_ADMIN';
CREATE TABLE "Company" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "Company" ("id", "name") VALUES ('initial-company', 'Empresa inicial');
ALTER TABLE "User" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Delivery" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Shift" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Location" ADD COLUMN "companyId" TEXT;
ALTER TABLE "DeliveryChange" ADD COLUMN "companyId" TEXT;
UPDATE "User" SET "companyId" = 'initial-company';
UPDATE "Delivery" SET "companyId" = 'initial-company';
UPDATE "Shift" SET "companyId" = 'initial-company';
UPDATE "Location" SET "companyId" = 'initial-company';
UPDATE "DeliveryChange" SET "companyId" = 'initial-company';
ALTER TABLE "Delivery" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Shift" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Location" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "DeliveryChange" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id");
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id");
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id");
ALTER TABLE "Location" ADD CONSTRAINT "Location_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id");
ALTER TABLE "DeliveryChange" ADD CONSTRAINT "DeliveryChange_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id");
CREATE INDEX "User_companyId_idx" ON "User"("companyId");
CREATE INDEX "Delivery_companyId_status_idx" ON "Delivery"("companyId", "status");
CREATE INDEX "Shift_companyId_idx" ON "Shift"("companyId");
CREATE INDEX "Location_companyId_idx" ON "Location"("companyId");
CREATE INDEX "DeliveryChange_companyId_idx" ON "DeliveryChange"("companyId");
-- Enforce same-company driver links even if application validation regresses.
CREATE UNIQUE INDEX "User_id_companyId_key" ON "User"("id", "companyId");
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_driver_company_fkey" FOREIGN KEY ("driverId", "companyId") REFERENCES "User"("id", "companyId");
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_driver_company_fkey" FOREIGN KEY ("driverId", "companyId") REFERENCES "User"("id", "companyId");
ALTER TABLE "Location" ADD CONSTRAINT "Location_driver_company_fkey" FOREIGN KEY ("driverId", "companyId") REFERENCES "User"("id", "companyId");
CREATE UNIQUE INDEX "Delivery_id_companyId_key" ON "Delivery"("id", "companyId");
ALTER TABLE "DeliveryChange" ADD CONSTRAINT "DeliveryChange_delivery_company_fkey" FOREIGN KEY ("deliveryId", "companyId") REFERENCES "Delivery"("id", "companyId");
ALTER TABLE "User" ADD CONSTRAINT "User_role_company_check" CHECK (
  ("role"::text = 'PLATFORM_ADMIN' AND "companyId" IS NULL) OR
  ("role"::text IN ('ADMIN', 'DRIVER') AND "companyId" IS NOT NULL)
);
COMMIT;
