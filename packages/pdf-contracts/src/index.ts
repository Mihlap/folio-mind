export type JobStatus = 'queued' | 'active' | 'completed' | 'failed';

export type DocumentVersionStatus = 'pending' | 'ready' | 'failed';

export type PreviewJobPayload = {
  documentVersionId: string;
  s3Key: string;
};
