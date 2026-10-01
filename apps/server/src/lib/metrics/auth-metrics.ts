import type { PrismaClient } from '@prisma/client';

export const AUTH_EVENT_REGISTER = 'register';
export const AUTH_EVENT_LOGIN = 'login';

type AuthEventInput = {
  type: string;
  userId?: string | null;
  tenantId?: string | null;
};

/**
 * Пишет событие посещаемости (регистрация / вход).
 * Ошибки не поднимаются: метрика не должна ломать аутентификацию.
 */
export async function recordAuthEvent(prisma: PrismaClient, input: AuthEventInput): Promise<void> {
  try {
    await prisma.authEvent.create({
      data: {
        type: input.type,
        userId: input.userId ?? null,
        tenantId: input.tenantId ?? null,
      },
    });
  } catch (err) {
    console.error('[auth-metrics] не удалось записать событие', {
      type: input.type,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export type AuthMetricsSummary = {
  from: string;
  to: string;
  registrations: number;
  logins: number;
  activeUsers: number;
  byDay: Array<{ day: string; registrations: number; logins: number }>;
};

function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Считает регистрации и входы за период, с разбивкой по дням (UTC).
 */
export async function getAuthMetrics(
  prisma: PrismaClient,
  opts: { days?: number } = {},
): Promise<AuthMetricsSummary> {
  const days = Math.min(Math.max(opts.days ?? 30, 1), 365);
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  from.setUTCHours(0, 0, 0, 0);

  const events = await prisma.authEvent.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { type: true, userId: true, createdAt: true },
  });

  const byDayMap = new Map<string, { registrations: number; logins: number }>();
  for (let i = 0; i < days; i += 1) {
    const key = dayKey(new Date(from.getTime() + i * 24 * 60 * 60 * 1000));
    byDayMap.set(key, { registrations: 0, logins: 0 });
  }

  let registrations = 0;
  let logins = 0;
  const userIds = new Set<string>();

  for (const event of events) {
    if (event.userId) userIds.add(event.userId);
    const bucket = byDayMap.get(dayKey(event.createdAt));
    if (!bucket) continue;
    if (event.type === AUTH_EVENT_REGISTER) {
      registrations += 1;
      bucket.registrations += 1;
    } else if (event.type === AUTH_EVENT_LOGIN) {
      logins += 1;
      bucket.logins += 1;
    }
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    registrations,
    logins,
    activeUsers: userIds.size,
    byDay: [...byDayMap.entries()].map(([day, value]) => ({ day, ...value })),
  };
}
