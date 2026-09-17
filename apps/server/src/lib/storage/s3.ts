import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import http from 'node:http';
import https from 'node:https';
import type { Readable } from 'node:stream';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  FILES_ROOT,
  appliedDocxKey,
  assertS3KeyUnderFilesRoot,
  exportReportKey,
  exportReportPdfKey,
  exportReportWordKey,
  extractedTextKey,
  preConvertedDocxKey,
  previewPageKeyForVariant,
  resolveS3Key,
  type PreviewPageVariant,
  type S3PrefixKey,
} from '@folio-mind/pdf-contracts';
import type { Env } from '../config/env.js';
export { resolveS3Key } from '@folio-mind/pdf-contracts';
let client: S3Client | null = null;
let bucketName = '';
let publicBaseUrl = '';
let s3Env: Env | null = null;
const inflightFullReads = new Map<string, Promise<{ buffer: Buffer; contentType: string }>>();
let s3ReadChain: Promise<unknown> = Promise.resolve();

function withS3ReadLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = s3ReadChain.then(fn, fn);
  s3ReadChain = next.catch(() => {});
  return next;
}

async function fetchObjectBufferViaPresignedUrl(
  key: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const url = await getPresignedGetUrl({ key, expiresInSeconds: 600 });
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(22_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      return {
        buffer,
        contentType: res.headers.get('content-type') ?? 'application/pdf',
      };
    } catch (err) {
      lastError = err;
      if (attempt < 3) {
        resetS3Transport();
        await sleep(350 * attempt);
      }
    }
  }
  throw lastError;
}

function createS3Client(env: Env): S3Client {
  return new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    requestHandler: createS3RequestHandler(),
    maxAttempts: 2,
  });
}

function resetS3Transport(): void {
  if (!s3Env) return;
  client?.destroy();
  client = createS3Client(s3Env);
}

function createS3RequestHandler(): NodeHttpHandler {
  return new NodeHttpHandler({
    connectionTimeout: 10_000,
    socketTimeout: 30_000,
    requestTimeout: 30_000,
    httpsAgent: new https.Agent({ keepAlive: false, maxSockets: 16 }),
    httpAgent: new http.Agent({ keepAlive: false, maxSockets: 16 }),
  });
}

async function sendS3WithRetry<T>(label: string, run: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await run();
    } catch (err) {
      lastError = err;
      if (!isRetryableS3NetworkError(err) || attempt === maxAttempts) throw err;
      resetS3Transport();
      await sleep(400 * attempt);
    }
  }
  throw lastError;
}
export function initS3(env: Env): void {
  if (!env.S3_BUCKET_NAME || !env.S3_ACCESS_KEY || !env.S3_SECRET_ACCESS_KEY) {
    return;
  }
  s3Env = env;
  bucketName = env.S3_BUCKET_NAME;
  publicBaseUrl =
    env.S3_PUBLIC_URL?.replace(/\/+$/, '') || `https://${bucketName}.s3.timeweb.cloud`;
  client?.destroy();
  client = createS3Client(env);
  void configureBucketCors().catch((err) =>
    console.warn(
      '[s3] Failed to configure bucket CORS — настройте CORS вручную в панели Timeweb:',
      err,
    ),
  );
}
async function configureBucketCors(): Promise<void> {
  if (!client || !bucketName) return;
  const frontendOrigin = process.env.FRONTEND_URL?.replace(/\/+$/, '') ?? 'http://localhost:5173';
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [frontendOrigin],
            AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
}
export function isS3Configured(): boolean {
  return client !== null && bucketName.length > 0;
}
function isRetryableS3NetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    code?: string;
    name?: string;
    message?: string;
  };
  return (
    e.code === 'ECONNRESET' ||
    e.code === 'ETIMEDOUT' ||
    e.code === 'ENOTFOUND' ||
    e.code === 'EPIPE' ||
    e.name === 'TimeoutError' ||
    (typeof e.message === 'string' &&
      /ECONNRESET|ETIMEDOUT|timeout|socket hang up|network/i.test(e.message))
  );
}
export function isS3NetworkError(err: unknown): boolean {
  return isRetryableS3NetworkError(err);
}
function isS3NotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    name?: string;
    Code?: string;
    $metadata?: {
      httpStatusCode?: number;
    };
  };
  return (
    e.name === 'NoSuchKey' ||
    e.name === 'NotFound' ||
    e.Code === 'NoSuchKey' ||
    e.Code === 'NotFound' ||
    e.$metadata?.httpStatusCode === 404
  );
}
async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
export function buildPublicUrl(key: string): string {
  return `${publicBaseUrl}/${key.replace(/^\/+/, '')}`;
}
export async function uploadBufferToS3(params: {
  prefix: S3PrefixKey;
  fileName: string;
  body: Buffer;
  contentType: string;
}): Promise<{
  key: string;
  url: string;
}> {
  if (!client) throw new Error('S3 is not configured');
  const key = resolveS3Key(params.prefix, params.fileName);
  const upload = new Upload({
    client,
    params: {
      Bucket: bucketName,
      Key: key,
      Body: params.body,
      ContentType: params.contentType,
      ACL: 'public-read',
    },
  });
  await upload.done();
  return { key, url: buildPublicUrl(key) };
}
export type S3DeleteFailure = { key: string; error: string };
export type S3DeleteResult = { deleted: string[]; failed: S3DeleteFailure[] };

export type VersionStorageKeys = {
  s3Key?: string | null;
  sourceDocxKey?: string | null;
};

export function collectVersionObjectKeys(
  documentId: string,
  versionId: string,
  storage: VersionStorageKeys,
): string[] {
  const keys = new Set<string>();
  for (const key of [storage.s3Key, storage.sourceDocxKey]) {
    if (key && key !== 'pending') keys.add(key);
  }
  keys.add(preConvertedDocxKey(documentId, versionId));
  keys.add(appliedDocxKey(documentId, versionId));
  keys.add(extractedTextKey(documentId, versionId));
  keys.add(exportReportKey(documentId, versionId));
  keys.add(exportReportWordKey(documentId, versionId));
  keys.add(exportReportPdfKey(documentId, versionId));
  return [...keys];
}

async function deleteObjectByKeySafe(key: string): Promise<S3DeleteFailure | null> {
  if (!client || !key || key === 'pending') return null;
  try {
    await deleteObjectByKey(key);
    return null;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { key, error };
  }
}

async function deleteObjectsByPrefixSafe(prefix: string): Promise<S3DeleteFailure[]> {
  if (!client) return [];
  try {
    await deleteObjectsByPrefix(prefix);
    return [];
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return [{ key: `${prefix}/*`, error }];
  }
}

function mergeDeleteResults(parts: S3DeleteResult[]): S3DeleteResult {
  const deleted = new Set<string>();
  const failed: S3DeleteFailure[] = [];
  for (const part of parts) {
    for (const key of part.deleted) deleted.add(key);
    failed.push(...part.failed);
  }
  return { deleted: [...deleted], failed };
}

async function deleteKnownObjectKeys(keys: string[]): Promise<S3DeleteResult> {
  const deleted: string[] = [];
  const failed: S3DeleteFailure[] = [];
  for (const key of keys) {
    const failure = await deleteObjectByKeySafe(key);
    if (failure) failed.push(failure);
    else deleted.push(key);
  }
  return { deleted, failed };
}
export async function deleteFromS3(prefix: S3PrefixKey, fileName: string): Promise<void> {
  if (!client) throw new Error('S3 is not configured');
  const key = resolveS3Key(prefix, fileName);
  await deleteObjectByKey(key);
}
export async function deleteObjectByKey(key: string): Promise<void> {
  if (!client) throw new Error('S3 is not configured');
  if (key === 'pending') return;
  assertS3KeyUnderFilesRoot(key);
  await sendS3WithRetry('S3 deleteObject', async () => {
    await client!.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );
  });
}
export async function deleteObjectsByPrefix(prefix: string): Promise<void> {
  if (!client) throw new Error('S3 is not configured');
  const normalized = prefix.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized.startsWith(`${FILES_ROOT}/`)) {
    throw new Error(`S3 prefix must start with ${FILES_ROOT}/ (got: ${prefix})`);
  }
  const listPrefix = `${normalized}/`;
  let continuationToken: string | undefined;
  do {
    const listed = await sendS3WithRetry('S3 listObjectsForDelete', async () =>
      client!.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: listPrefix,
          ContinuationToken: continuationToken,
        }),
      ),
    );
    const keys = (listed.Contents ?? [])
      .map((item) => item.Key)
      .filter((key): key is string => Boolean(key));
    if (keys.length > 0) {
      await sendS3WithRetry('S3 deleteObjects', async () =>
        client!.send(
          new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: {
              Objects: keys.map((Key) => ({ Key })),
              Quiet: true,
            },
          }),
        ),
      );
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
}
export async function listObjectKeysByPrefix(
  prefix: string,
): Promise<Array<{ key: string; lastModified: Date | null }>> {
  if (!client) throw new Error('S3 is not configured');
  const normalized = prefix.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized.startsWith(`${FILES_ROOT}/`)) {
    throw new Error(`S3 prefix must start with ${FILES_ROOT}/ (got: ${prefix})`);
  }
  const listPrefix = `${normalized}/`;
  const out: Array<{ key: string; lastModified: Date | null }> = [];
  let continuationToken: string | undefined;
  do {
    const listed = await sendS3WithRetry('S3 listObjects', async () =>
      client!.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: listPrefix,
          ContinuationToken: continuationToken,
        }),
      ),
    );
    for (const item of listed.Contents ?? []) {
      if (!item.Key) continue;
      out.push({ key: item.Key, lastModified: item.LastModified ?? null });
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
  return out;
}
export type DeleteVersionArtifactsOptions = {
  versionNumber?: number;
};

export async function deleteVersionArtifacts(
  documentId: string,
  versionId: string,
  storage: VersionStorageKeys,
  options: DeleteVersionArtifactsOptions = {},
): Promise<S3DeleteResult> {
  const objectKeys = collectVersionObjectKeys(documentId, versionId, storage);
  const known = await deleteKnownObjectKeys(objectKeys);
  const prefixFailures: S3DeleteFailure[] = [];
  const prefixes = [
    resolveS3Key('previews', `${documentId}/${versionId}`),
    resolveS3Key('processing', `${documentId}/${versionId}`),
    resolveS3Key('exports', `${documentId}/${versionId}`),
  ];
  if (options.versionNumber != null && options.versionNumber > 0) {
    prefixes.push(resolveS3Key('originals', `${documentId}/v${options.versionNumber}`));
  }
  for (const prefix of prefixes) {
    prefixFailures.push(...(await deleteObjectsByPrefixSafe(prefix)));
  }
  return mergeDeleteResults([known, { deleted: [], failed: prefixFailures }]);
}

export type DocumentVersionStorage = {
  versionId: string;
  s3Key: string;
  sourceDocxKey?: string | null;
  versionNumber?: number;
};

export async function deleteDocumentArtifacts(
  documentId: string,
  versions: DocumentVersionStorage[] = [],
): Promise<S3DeleteResult> {
  const parts: S3DeleteResult[] = [];
  for (const version of versions) {
    parts.push(
      await deleteVersionArtifacts(documentId, version.versionId, {
        s3Key: version.s3Key,
        sourceDocxKey: version.sourceDocxKey,
      }, { versionNumber: version.versionNumber }),
    );
  }
  const prefixFailures: S3DeleteFailure[] = [];
  for (const prefix of [
    resolveS3Key('originals', documentId),
    resolveS3Key('previews', documentId),
    resolveS3Key('processing', documentId),
    resolveS3Key('exports', documentId),
  ]) {
    prefixFailures.push(...(await deleteObjectsByPrefixSafe(prefix)));
  }
  parts.push({ deleted: [], failed: prefixFailures });
  return mergeDeleteResults(parts);
}
export function getS3BucketName(): string {
  return bucketName;
}
export function getS3Client(): S3Client | null {
  return client;
}
export async function s3ObjectExists(key: string): Promise<boolean> {
  if (!client) return false;
  assertS3KeyUnderFilesRoot(key);
  const maxAttempts = 4;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: key,
        }),
      );
      return true;
    } catch (err) {
      if (isS3NotFoundError(err)) return false;
      lastError = err;
      if (!isRetryableS3NetworkError(err) || attempt === maxAttempts) throw err;
      await sleep(300 * attempt);
    }
  }
  throw lastError;
}
export async function putObjectByKey(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  if (!client) throw new Error('S3 is not configured');
  assertS3KeyUnderFilesRoot(params.key);
  const maxAttempts = 5;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const upload = new Upload({
        client,
        params: {
          Bucket: bucketName,
          Key: params.key,
          Body: params.body,
          ContentType: params.contentType,
        },
        queueSize: 2,
        partSize: Math.min(5 * 1024 * 1024, Math.max(params.body.length, 5 * 1024 * 1024)),
        leavePartsOnError: false,
      });
      await upload.done();
      return;
    } catch (err) {
      lastError = err;
      if (!isRetryableS3NetworkError(err) || attempt === maxAttempts) throw err;
      await sleep(600 * attempt);
    }
  }
  throw lastError;
}
export async function getPresignedPutUrl(params: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<string> {
  if (!client) throw new Error('S3 is not configured');
  assertS3KeyUnderFilesRoot(params.key);
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: params.key,
    ContentType: params.contentType,
  });
  return getSignedUrl(client, command, { expiresIn: params.expiresInSeconds ?? 3600 });
}
export async function getPresignedGetUrl(params: {
  key: string;
  expiresInSeconds?: number;
}): Promise<string> {
  if (!client) throw new Error('S3 is not configured');
  assertS3KeyUnderFilesRoot(params.key);
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: params.key,
  });
  return getSignedUrl(client, command, { expiresIn: params.expiresInSeconds ?? 3600 });
}
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const { buffer } = await getObjectWithBuffer(key);
  return buffer;
}
export async function getObjectWithBuffer(
  key: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  return withS3ReadLock(() => {
    const inflight = inflightFullReads.get(key);
    if (inflight) return inflight;
    const promise = readFullObject(key).finally(() => {
      inflightFullReads.delete(key);
    });
    inflightFullReads.set(key, promise);
    return promise;
  });
}
async function readFullObject(key: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (!client) throw new Error('S3 is not configured');
  assertS3KeyUnderFilesRoot(key);
  try {
    return await fetchObjectBufferViaPresignedUrl(key);
  } catch {
    return sendS3WithRetry('S3 getObject', async () => {
      const out = await withTimeout(
        client!.send(
          new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
          }),
        ),
        18_000,
        'S3 getObject',
      );
      if (!out.Body) throw new Error('S3 object not found');
      const buffer = await withTimeout(streamToBuffer(out.Body as Readable), 45_000, 'S3 read stream');
      return {
        buffer,
        contentType: out.ContentType ?? 'application/pdf',
      };
    });
  }
}
export async function getObjectByteRange(
  key: string,
  rangeHeader: string,
): Promise<{
  body: Buffer;
  contentType: string;
  contentRange?: string;
  contentLength: number;
}> {
  if (!client) throw new Error('S3 is not configured');
  assertS3KeyUnderFilesRoot(key);
  const range = rangeHeader.trim().toLowerCase().startsWith('bytes=')
    ? rangeHeader.trim()
    : `bytes=${rangeHeader.trim()}`;
  return sendS3WithRetry('S3 getObjectRange', async () => {
    const out = await withTimeout(
      client!.send(
        new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
          Range: range,
        }),
      ),
      15_000,
      'S3 getObjectRange',
    );
    if (!out.Body) throw new Error('S3 object not found');
    const body = await withTimeout(streamToBuffer(out.Body as Readable), 90_000, 'S3 read range');
    return {
      body,
      contentType: out.ContentType ?? 'application/pdf',
      contentRange: out.ContentRange,
      contentLength: body.length,
    };
  });
}
export async function getObjectReadable(key: string): Promise<{
  body: Readable;
  contentType: string;
  contentLength?: number;
}> {
  const { buffer, contentType } = await getObjectWithBuffer(key);
  const { Readable: ReadableStream } = await import('node:stream');
  return {
    body: ReadableStream.from(buffer),
    contentType,
    contentLength: buffer.length,
  };
}
export async function tryGetObjectBuffer(key: string): Promise<Buffer | null> {
  try {
    return await getObjectBuffer(key);
  } catch {
    return null;
  }
}
export async function listPreviewPagesInRange(
  documentId: string,
  versionId: string,
  fromPage: number,
  toPage: number,
  variant: PreviewPageVariant = 'thumb',
): Promise<Set<number>> {
  if (!client || toPage < fromPage) return new Set();
  const found = new Set<number>();
  const pages = Array.from({ length: toPage - fromPage + 1 }, (_, index) => fromPage + index);
  await Promise.all(
    pages.map(async (page) => {
      const key = previewPageKeyForVariant(documentId, versionId, page, variant);
      if (await headObjectExists(key, 6_000)) {
        found.add(page);
      }
    }),
  );
  return found;
}
async function headObjectExists(key: string, timeoutMs: number): Promise<boolean> {
  if (!client) return false;
  assertS3KeyUnderFilesRoot(key);
  try {
    await withTimeout(
      client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: key,
        }),
      ),
      timeoutMs,
      'S3 headObject',
    );
    return true;
  } catch (err) {
    if (isS3NotFoundError(err)) return false;
    return false;
  }
}

export async function checkAppliedDocxVersionIds(
  documentId: string,
  versionIds: string[],
): Promise<Set<string>> {
  if (!client || versionIds.length === 0) return new Set();
  const found = new Set<string>();
  await Promise.all(
    versionIds.map(async (versionId) => {
      const key = resolveS3Key('processing', `${documentId}/${versionId}/applied.docx`);
      if (await headObjectExists(key, 6_000)) {
        found.add(versionId);
      }
    }),
  );
  return found;
}
