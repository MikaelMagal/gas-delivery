import { z } from 'zod';
const date = z.string().date();
export const reportQuery = z.object({
  from: date, to: date,
  dateBy: z.enum(['createdAt', 'deliveredAt']).default('deliveredAt'),
  status: z.enum(['PENDING', 'EN_ROUTE', 'DELIVERED', 'CANCELED']).optional(),
  driverId: z.string().trim().min(1).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
// Business dates are interpreted in Brasilia time (UTC-03), independent of server TZ.
export function reportWindow(from: string, to: string) {
  date.parse(from); date.parse(to);
  const start = new Date(`${from}T00:00:00-03:00`);
  const end = new Date(new Date(`${to}T00:00:00-03:00`).getTime() + 86400000);
  if (start >= end) throw Object.assign(new Error('A data inicial deve ser anterior ou igual à final.'), { status: 409 });
  if (end.getTime() - start.getTime() > 366 * 86400000) throw Object.assign(new Error('Selecione um período de até 366 dias.'), { status: 409 });
  return { gte: start, lt: end };
}
