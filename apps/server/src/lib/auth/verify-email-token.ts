import type { PrismaClient } from '@prisma/client';
import { sha256Hex } from './password-reset.js';

export type VerifyEmailResult =
  | { ok: true }
  | { ok: false; error: 'INVALID_TOKEN' };

export async function verifyEmailWithToken(
  prisma: PrismaClient,
  rawToken: string,
): Promise<VerifyEmailResult> {
  const token = rawToken.trim();
  if (token.length < 10) {
    return { ok: false, error: 'INVALID_TOKEN' };
  }

  const tokenHash = sha256Hex(token);
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: 'INVALID_TOKEN' };
  }

  const verifiedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: verifiedAt },
    });
    await tx.emailVerificationToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: verifiedAt },
    });
    await tx.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: verifiedAt },
    });
  });

  return { ok: true };
}
