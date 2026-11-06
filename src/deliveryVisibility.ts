import { startOfToday } from './utils';

export function operationalWindow(now = new Date()) {
  const start = startOfToday(now);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    OR: [
      { status: { in: ['PENDING', 'EN_ROUTE'] as ('PENDING' | 'EN_ROUTE')[] } },
      { status: 'DELIVERED' as const, deliveredAt: { gte: start, lt: end } },
      { status: 'CANCELED' as const, createdAt: { gte: start, lt: end } },
    ],
  };
}

const priority = { EN_ROUTE: 0, PENDING: 1, DELIVERED: 2, CANCELED: 3 };
export function byOperationalStatus(a: { status: keyof typeof priority }, b: { status: keyof typeof priority }) {
  return priority[a.status] - priority[b.status];
}
