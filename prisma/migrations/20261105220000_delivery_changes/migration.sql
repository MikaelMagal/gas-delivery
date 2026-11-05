CREATE TABLE "DeliveryChange" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeliveryChange_deliveryId_createdAt_idx" ON "DeliveryChange"("deliveryId", "createdAt");
ALTER TABLE "DeliveryChange" ADD CONSTRAINT "DeliveryChange_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryChange" ADD CONSTRAINT "DeliveryChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
