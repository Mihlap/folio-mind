import type { PrismaClient } from '@prisma/client';

const DEFAULT_RETENTION_DAYS = 365;
const DEFAULT_SWEEP_INTERVAL_HOURS = 24;
const DEFAULT_SWEEP_START_DELAY_MINUTES = 10;
const DELETE_BATCH = 5000;

type Logger = {
  info: (obj: unknown, msg?: string) => void;
};

/**
 * Срок хранения событий посещаемости. По умолчанию 12 месяцев,
 * как и сказано в политике конфиденциальности.
 */
export function authEventRetentionDays(): number {
  const days = Number(process.env.AUTH_EVENT_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
  return Number.isFinite(days) && days > 0 ? Math.floor(days) : DEFAULT_RETENTION_DAYS;
}

function sweepIntervalMs(): number {
  const hours = Number(process.env.AUTH_EVENT_SWEEP_INTERVAL_HOURS ?? DEFAULT_SWEEP_INTERVAL_HOURS);
  return (
    (Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_SWEEP_INTERVAL_HOURS) * 60 * 60 * 1000
  );
}

function startDelayMs(): number {
  const minutes = Number(
    process.env.AUTH_EVENT_SWEEP_START_DELAY_MINUTES ?? DEFAULT_SWEEP_START_DELAY_MINUTES,
  );
  return (
    (Number.isFinite(minutes) && minutes >= 0 ? minutes : DEFAULT_SWEEP_START_DELAY_MINUTES) *
    60 *
    1000
  );
}

/**
 * Удаляет события старше срока хранения. Удаление порциями,
 * чтобы не держать длинную транзакцию на большой таблице.
 * Опция tenantId нужна только для точечной уборки и тестов.
 */
export async function sweepStaleAuthEvents(
  prisma: PrismaClient,
  opts: { tenantId?: string } = {},
): Promise<number> {
  const cutoff = new Date(Date.now() - authEventRetentionDays() * 24 * 60 * 60 * 1000);
  const where: { createdAt: { lt: Date }; tenantId?: string } = { createdAt: { lt: cutoff } };
  if (opts.tenantId) where.tenantId = opts.tenantId;
  let total = 0;

  for (;;) {
    const stale = await prisma.authEvent.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: DELETE_BATCH,
      select: { id: true },
    });
    if (stale.length === 0) break;

    const result = await prisma.authEvent.deleteMany({
      where: { id: { in: stale.map((row) => row.id) } },
    });
    total += result.count;
    if (stale.length < DELETE_BATCH) break;
  }

  return total;
}

export async function runAuthEventRetention(prisma: PrismaClient, log: Logger): Promise<number> {
  const deleted = await sweepStaleAuthEvents(prisma);
  log.info(
    { deleted, retentionDays: authEventRetentionDays() },
    '[auth-metrics] retention run finished',
  );
  return deleted;
}

/** Раз в сутки чистит старые события, чтобы таблица не росла бесконечно. */
export function startAuthEventRetention(prisma: PrismaClient): void {
  const log: Logger = {
    info: (obj, msg) => console.log(msg ?? 'auth-metrics retention', obj),
  };
  const run = () => {
    runAuthEventRetention(prisma, log).catch((err) => {
      console.warn('[auth-metrics] retention run failed', err);
    });
  };
  const timer = setTimeout(() => {
    run();
    setInterval(run, sweepIntervalMs()).unref();
  }, startDelayMs());
  timer.unref();
}
