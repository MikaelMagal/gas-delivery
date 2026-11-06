import { PrismaClient } from '@prisma/client';
import { scopeQuery, tenantId } from './tenant';

// Global client is restricted to authentication, platform management and startup checks.
export const systemPrisma = new PrismaClient();
export const prisma = systemPrisma.$extends({ query: { $allModels: {
  async $allOperations({ model, operation, args, query }) {
    return query(scopeQuery(model, operation, args, tenantId()));
  },
} } });
