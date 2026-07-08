export type WorkerJobPayload = {
  requestId?: string;
  tenantId?: string;
  jobId?: string;
  documentId?: string;
  versionId?: string;
  s3Key?: string;
  [key: string]: unknown;
};
