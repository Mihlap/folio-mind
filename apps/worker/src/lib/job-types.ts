export type WorkerJobPayload = {
  requestId?: string;
  tenantId?: string;
  [key: string]: unknown;
};
