import { AsyncLocalStorage } from 'node:async_hooks';

export const tenantContext = new AsyncLocalStorage<string>();
export function tenantId() {
  const id = tenantContext.getStore();
  if (!id) throw Object.assign(new Error('Selecione uma empresa para operar.'), { status: 403 });
  return id;
}

// Used by every operational Prisma query, including interactive transactions.
// Scope is server-owned and is never taken from a request body or query string.
export function scopeQuery(model: string, operation: string, args: any, companyId: string) {
  if (!['User', 'Delivery', 'Shift', 'Location', 'DeliveryChange'].includes(model)) throw new Error('Modelo fora do escopo operacional');
  if (['findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany'].includes(operation)) {
    args.where = { ...args.where, companyId };
  } else if (!['create', 'createMany', 'createManyAndReturn'].includes(operation)) {
    throw new Error('Operação não autorizada no cliente de empresa');
  }
  if (args.data) {
    const data = Array.isArray(args.data) ? args.data : [args.data];
    for (const item of data) {
      // Disallow nested relation writes: all links must use checked scalar IDs.
      if (Object.entries(item).some(([key, value]) => value !== null && typeof value === 'object' && !(value instanceof Date) && !(model === 'DeliveryChange' && ['before', 'after'].includes(key)))) throw new Error('Escrita aninhada não autorizada');
      if (item.companyId !== undefined && item.companyId !== companyId) throw new Error('Empresa inválida');
      if (operation.startsWith('create')) item.companyId = companyId;
      else delete item.companyId;
    }
  }
  return args;
}
