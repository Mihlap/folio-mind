import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { Env } from './env.js';
import { S3_PREFIX, type S3PrefixKey } from './s3-paths.js';

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

export function resolveS3Key(prefix: S3PrefixKey, fileName: string): string {
  const folder = S3_PREFIX[prefix];
  return `${folder}/${fileName.replace(/^\/+/, '')}`;
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
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
  );
}
