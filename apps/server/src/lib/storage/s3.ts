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
  S3_PREFIX,
  assertS3KeyUnderFilesRoot,
  resolveS3Key,
  type S3PrefixKey,
} from '@folio-mind/pdf-contracts';
import type { Env } from '../config/env.js';
export { resolveS3Key } from '@folio-mind/pdf-contracts';
let client: S3Client | null = null;
let bucketName = '';
let publicBaseUrl = '';
const inflightFullReads = new Map<string, Promise<{ buffer: Buffer; contentType: string }>>();

function createS3RequestHandler(): NodeHttpHandler {
  return new NodeHttpHandler({
    connectionTimeout: 30_000,
    socketTimeout: 300_000,
    requestTimeout: 300_000,
    httpsAgent: new https.Agent({ keepAlive: false, maxSockets: 16 }),
    httpAgent: new http.Agent({ keepAlive: false, maxSockets: 16 }),
  });
}

async function sendS3WithRetry<T>(label: string, run: () => Promise<T>, maxAttempts = 6): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await run();
    } catch (err) {
      lastError = err;
      if (!isRetryableS3NetworkError(err) || attempt === maxAttempts) throw err;
      await sleep(500 * attempt);
    }
  }
  throw lastError;
}
export function initS3(env: Env): void {
  if (!env.S3_BUCKET_NAME || !env.S3_ACCESS_KEY || !env.S3_SECRET_ACCESS_KEY) {
    return;
  }
  bucketName = env.S3_BUCKET_NAME;
  publicBaseUrl =
    env.S3_PUBLIC_URL?.replace(/\/+$/, '') || `https://${bucketName}.s3.timeweb.cloud`;
  const requestHandler = createS3RequestHandler();
  client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    requestHandler,
    maxAttempts: 3,
  });
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
      /ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(e.message))
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
export async function deleteFromS3(prefix: S3PrefixKey, fileName: string): Promise<void> {
  if (!client) throw new Error('S3 is not configured');
  const key = resolveS3Key(prefix, fileName);
  await deleteObjectByKey(key);
}
export async function deleteObjectByKey(key: string): Promise<void> {
  if (!client) throw new Error('S3 is not configured');
  if (key === 'pending') return;
  assertS3KeyUnderFilesRoot(key);
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
  );
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
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: listPrefix,
        ContinuationToken: continuationToken,
      }),
    );
    const keys = (listed.Contents ?? [])
      .map((item) => item.Key)
      .filter((key): key is string => Boolean(key));
    if (keys.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: keys.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
}
export async function deleteVersionArtifacts(
  documentId: string,
  versionId: string,
  originalS3Key: string,
): Promise<void> {
  if (originalS3Key && originalS3Key !== 'pending') {
    await deleteObjectByKey(originalS3Key);
  }
  await deleteObjectsByPrefix(resolveS3Key('previews', `${documentId}/${versionId}`));
  await deleteObjectsByPrefix(resolveS3Key('processing', `${documentId}/${versionId}`));
  await deleteObjectsByPrefix(resolveS3Key('exports', `${documentId}/${versionId}`));
}
export async function deleteDocumentArtifacts(documentId: string): Promise<void> {
  await deleteObjectsByPrefix(resolveS3Key('originals', documentId));
  await deleteObjectsByPrefix(resolveS3Key('previews', documentId));
  await deleteObjectsByPrefix(resolveS3Key('processing', documentId));
  await deleteObjectsByPrefix(resolveS3Key('exports', documentId));
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
  const inflight = inflightFullReads.get(key);
  if (inflight) return inflight;
  const promise = readFullObject(key).finally(() => {
    inflightFullReads.delete(key);
  });
  inflightFullReads.set(key, promise);
  return promise;
}
async function readFullObject(key: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (!client) throw new Error('S3 is not configured');
  assertS3KeyUnderFilesRoot(key);
  return sendS3WithRetry('S3 getObject', async () => {
    const out = await withTimeout(
      client!.send(
        new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
        }),
      ),
      60_000,
      'S3 getObject',
    );
    if (!out.Body) throw new Error('S3 object not found');
    const buffer = await withTimeout(streamToBuffer(out.Body as Readable), 180_000, 'S3 read stream');
    return {
      buffer,
      contentType: out.ContentType ?? 'application/pdf',
    };
  });
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
      45_000,
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
export async function listExistingPreviewPageNumbers(
  documentId: string,
  versionId: string,
): Promise<Set<number>> {
  if (!client) return new Set();
  const listPrefix = `${S3_PREFIX.previews}/${documentId}/${versionId}/`;
  const pages = new Set<number>();
  let continuationToken: string | undefined;
  do {
    const listed = await sendS3WithRetry('S3 listPreviewPages', () =>
      withTimeout(
        client!.send(
          new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: listPrefix,
            ContinuationToken: continuationToken,
          }),
        ),
        45_000,
        'S3 listPreviewPages',
      ),
    );
    for (const item of listed.Contents ?? []) {
      const match = item.Key?.match(/page-(\d+)\.png$/);
      if (match) pages.add(Number(match[1]));
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
  return pages;
}
