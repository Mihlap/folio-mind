import { HeadObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { assertS3KeyUnderFilesRoot } from '@folio-mind/pdf-contracts';
import type { Readable } from 'node:stream';
import type { WorkerEnv } from './env.js';

let client: S3Client | null = null;
let bucketName = '';

export function initWorkerS3(env: WorkerEnv): void {
  if (!env.S3_BUCKET_NAME || !env.S3_ACCESS_KEY || !env.S3_SECRET_ACCESS_KEY) {
    return;
  }
  bucketName = env.S3_BUCKET_NAME;
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

export function isWorkerS3Configured(): boolean {
  return client !== null && bucketName.length > 0;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  if (!client) throw new Error('S3 is not configured');
  assertS3KeyUnderFilesRoot(key);

  const out = await client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
  );
  if (!out.Body) throw new Error('S3 object not found');
  return streamToBuffer(out.Body as Readable);
}

export async function putObjectBuffer(params: {
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

export async function objectExists(key: string): Promise<boolean> {
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

export async function tryGetObjectBuffer(key: string): Promise<Buffer | null> {
  try {
    return await getObjectBuffer(key);
  } catch {
    return null;
  }
}
