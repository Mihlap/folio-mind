import { createHmac } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export async function dispatchTenantWebhooks(
  prisma: PrismaClient,
  params: {
    tenantId: string;
    event: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { tenantId: params.tenantId, enabled: true },
  });
  const targets = endpoints.filter((e) => e.events.includes(params.event) || e.events.includes('*'));
  await Promise.all(
    targets.map(async (endpoint) => {
      const body = JSON.stringify({
        event: params.event,
        payload: params.payload,
        sentAt: new Date().toISOString(),
      });
      const signature = createHmac('sha256', endpoint.secret).update(body).digest('hex');
      try {
        await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Folio-Signature': signature,
          },
          body,
        });
      } catch {
        // best-effort
      }
    }),
  );
}
