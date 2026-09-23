import type { PrismaClient } from '@prisma/client';
import { FILES_ROOT, resolveS3Key } from '@folio-mind/pdf-contracts';
import { deleteObjectByKey, isS3Configured, listObjectKeysByPrefix } from './s3.js';

export type StorageHousekeepingSummary = {
  exportsDeleted: number;
  orphanedVersionObjectsDeleted: number;
  orphanedOriginalObjectsDeleted: number;
};

type Logger = {
  warn: (obj: unknown, msg?: string) => void;
  info?: (obj: unknown, msg?: string) => void;
};

const BOOKLET_ZIP_FILE = 'booklet.zip';
const EPHEMERAL_ORPHAN_ROOTS = ['processing', 'previews', 'exports'] as const;
const DEFAULT_EXPORTS_TTL_HOURS = 24;
const DEFAULT_HOUSEKEEPING_INTERVAL_MINUTES = 360;
const DEFAULT_HOUSEKEEPING_START_DELAY_MINUTES = 5;
const CHUNK_SIZE = 500;

export function exportsTtlMs(): number {
  const hours = Number(process.env.STORAGE_EXPORTS_TTL_HOURS ?? DEFAULT_EXPORTS_TTL_HOURS);
  return (Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_EXPORTS_TTL_HOURS) * 60 * 60 * 1000;
}

function housekeepingIntervalMs(): number {
  const minutes = Number(
    process.env.STORAGE_HOUSEKEEPING_INTERVAL_MINUTES ?? DEFAULT_HOUSEKEEPING_INTERVAL_MINUTES,
  );
  return (
    (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_HOUSEKEEPING_INTERVAL_MINUTES) *
    60 *
    1000
  );
}

function startDelayMs(): number {
  const minutes = Number(
    process.env.STORAGE_HOUSEKEEPING_START_DELAY_MINUTES ??
      DEFAULT_HOUSEKEEPING_START_DELAY_MINUTES,
  );
  return (
    (Number.isFinite(minutes) && minutes >= 0
      ? minutes
      : DEFAULT_HOUSEKEEPING_START_DELAY_MINUTES) *
    60 *
    1000
  );
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function versionPairFromKey(
  key: string,
  root: string,
): { documentId: string; versionId: string } | null {
  const base = `${FILES_ROOT}/${root}/`;
  if (!key.startsWith(base)) return null;
  const rest = key.slice(base.length);
  const [documentId, versionId] = rest.split('/');
  if (!documentId || versionId === undefined) return null;
  return { documentId, versionId };
}

function originalFromKey(key: string): { documentId: string; versionNumber: number } | null {
  const base = `${FILES_ROOT}/originals/`;
  if (!key.startsWith(base)) return null;
  const rest = key.slice(base.length);
  const [documentId, fileName] = rest.split('/');
  if (!documentId || !fileName) return null;
  const match = /^v(\d+)(?:-|$)/.exec(fileName);
  if (!match) return null;
  const versionNumber = Number(match[1]);
  if (!Number.isFinite(versionNumber) || versionNumber <= 0) return null;
  return { documentId, versionNumber };
}

async function deleteKeysBestEffort(keys: string[], log: Logger, label: string): Promise<number> {
  let deleted = 0;
  let failed = 0;
  for (const key of keys) {
    try {
      await deleteObjectByKey(key);
      deleted += 1;
    } catch (err) {
      failed += 1;
      log.warn(
        { key, err: err instanceof Error ? err.message : String(err) },
        `[housekeeping] ${label} delete failed`,
      );
    }
  }
  if (failed > 0) {
    log.warn({ ok: deleted, failed }, `[housekeeping] ${label} sweep incomplete`);
  }
  return deleted;
}

export async function sweepStaleExports(log: Logger): Promise<number> {
  const ttl = exportsTtlMs();
  const now = Date.now();
  const keys = await listObjectKeysByPrefix(resolveS3Key('exports', ''));
  const stale: string[] = [];
  for (const { key, lastModified } of keys) {
    if (key.endsWith(`/${BOOKLET_ZIP_FILE}`)) continue;
    if (!lastModified || now - lastModified.getTime() < ttl) continue;
    stale.push(key);
  }
  return deleteKeysBestEffort(stale, log, 'stale exports');
}

export async function sweepOrphanedVersionObjects(
  prisma: PrismaClient,
  log: Logger,
): Promise<{ versionObjects: number; originals: number }> {
  const versionKeysByVersion = new Map<string, string[]>();
  for (const root of EPHEMERAL_ORPHAN_ROOTS) {
    const keys = await listObjectKeysByPrefix(resolveS3Key(root, ''));
    for (const { key } of keys) {
      const pair = versionPairFromKey(key, root);
      if (!pair) continue;
      const list = versionKeysByVersion.get(pair.versionId) ?? [];
      list.push(key);
      versionKeysByVersion.set(pair.versionId, list);
    }
  }

  const existingVersionIds = new Set<string>();
  const candidateIds = [...versionKeysByVersion.keys()];
  for (const chunk of chunkArray(candidateIds, CHUNK_SIZE)) {
    const rows = await prisma.documentVersion.findMany({
      where: { id: { in: chunk } },
      select: { id: true },
    });
    for (const row of rows) existingVersionIds.add(row.id);
  }

  const versionObjectsToDelete: string[] = [];
  for (const [versionId, keys] of versionKeysByVersion) {
    if (existingVersionIds.has(versionId)) continue;
    versionObjectsToDelete.push(...keys);
  }
  const versionObjects = await deleteKeysBestEffort(
    versionObjectsToDelete,
    log,
    'orphaned version objects',
  );

  const originalObjects: Array<{ key: string; documentId: string; versionNumber: number }> = [];
  const docIds = new Set<string>();
  for (const { key } of await listObjectKeysByPrefix(resolveS3Key('originals', ''))) {
    const original = originalFromKey(key);
    if (!original) continue;
    originalObjects.push({ key, ...original });
    docIds.add(original.documentId);
  }

  const existingOriginals = new Set<string>();
  for (const chunk of chunkArray([...docIds], CHUNK_SIZE)) {
    const rows = await prisma.documentVersion.findMany({
      where: { documentId: { in: chunk } },
      select: { documentId: true, version: true },
    });
    for (const row of rows) existingOriginals.add(`${row.documentId}:v${row.version}`);
  }

  const originalObjectsToDelete = originalObjects
    .filter((item) => !existingOriginals.has(`${item.documentId}:v${item.versionNumber}`))
    .map((item) => item.key);
  const originals = await deleteKeysBestEffort(originalObjectsToDelete, log, 'orphaned originals');

  return { versionObjects, originals };
}

export async function runStorageHousekeeping(
  prisma: PrismaClient,
  log: Logger,
): Promise<StorageHousekeepingSummary> {
  const summary: StorageHousekeepingSummary = {
    exportsDeleted: 0,
    orphanedVersionObjectsDeleted: 0,
    orphanedOriginalObjectsDeleted: 0,
  };
  if (!isS3Configured()) return summary;
  try {
    summary.exportsDeleted = await sweepStaleExports(log);
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      '[housekeeping] stale exports sweep failed',
    );
  }
  try {
    const orphans = await sweepOrphanedVersionObjects(prisma, log);
    summary.orphanedVersionObjectsDeleted = orphans.versionObjects;
    summary.orphanedOriginalObjectsDeleted = orphans.originals;
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      '[housekeeping] orphaned objects sweep failed',
    );
  }
  log?.info?.({ ...summary }, '[housekeeping] run finished');
  return summary;
}

export function startStorageHousekeeping(prisma: PrismaClient): void {
  if (!isS3Configured()) return;
  const log: Logger = {
    warn: (obj, msg) => console.warn(msg ?? 'housekeeping', obj),
    info: (obj, msg) => console.log(msg ?? 'housekeeping', obj),
  };
  const run = () => {
    runStorageHousekeeping(prisma, log).catch((err) => {
      console.warn('[housekeeping] run failed', err);
    });
  };
  const delay = startDelayMs();
  const timer = setTimeout(() => {
    run();
    setInterval(run, housekeepingIntervalMs()).unref();
  }, delay);
  timer.unref();
}
