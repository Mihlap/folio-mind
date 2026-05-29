import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  FILES_ROOT,
  assertS3KeyUnderFilesRoot,
  resolveS3Key,
  type S3PrefixKey,
} from '@folio-mind/pdf-contracts';
import type { Env } from '../config/env.js';

export { resolveS3Key } from '@folio-mind/pdf-contracts';

let client: S3Client | null = null;
let bucketName = '';
let publicBaseUrl = '';

export function initS3(env: Env): void {
  if (!env.S3_BUCKET_NAME || !env.S3_ACCESS_KEY || !env.S3_SECRET_ACCESS_KEY) {
    return;
  }

  bucketName = env.S3_BUCKET_NAME;
  publicBaseUrl =
    env.S3_PUBLIC_URL?.replace(/\/+$/, '') ||
    `https://${bucketName}.s3.timeweb.cloud`;

  client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
}

export function isS3Configured(): boolean {
  return client !== null && bucketName.length > 0;
}

export function buildPublicUrl(key: string): string {
  return `${publicBaseUrl}/${key.replace(/^\/+/, '')}`;
}

export async function uploadBufferToS3(params: {
  prefix: S3PrefixKey;
  fileName: string;
  body: Buffer;
  contentType: string;
}): Promise<{ key: string; url: string }> {
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

/** Удаляет все объекты с заданным префиксом (папка в S3 — только префикс ключей). */
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

/** Оригиналы, превью и артефакты обработки документа. */
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
  try {
    assertS3KeyUnderFilesRoot(key);
    await client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function putObjectByKey(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  if (!client) throw new Error('S3 is not configured');
  assertS3KeyUnderFilesRoot(params.key);
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  );
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

export async function getObjectReadable(key: string): Promise<{
  body: Readable;
  contentType: string;
  contentLength?: number;
}> {
  if (!client) throw new Error('S3 is not configured');
  assertS3KeyUnderFilesRoot(key);
  const out = await client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
  );
  if (!out.Body) {
    throw new Error('S3 object not found');
  }
  return {
    body: out.Body as Readable,
    contentType: out.ContentType ?? 'application/pdf',
    contentLength: out.ContentLength,
  };
}
