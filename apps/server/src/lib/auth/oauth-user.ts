import type { PrismaClient, User } from '@prisma/client';
import { hashUnusablePassword } from './password.js';
import type { OAuthProfile } from './oauth-providers.js';
export async function findOrCreateUserFromOAuth(
  prisma: PrismaClient,
  provider: string,
  profile: OAuthProfile,
): Promise<User> {
  const linked = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerUserId: {
        provider,
        providerUserId: profile.providerUserId,
      },
    },
    include: { user: true },
  });
  if (linked) {
    if (!linked.user.emailVerifiedAt) {
      return prisma.user.update({
        where: { id: linked.user.id },
        data: { emailVerifiedAt: new Date() },
      });
    }
    return linked.user;
  }
  const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
  if (byEmail) {
    await prisma.oAuthAccount.create({
      data: {
        provider,
        providerUserId: profile.providerUserId,
        userId: byEmail.id,
      },
    });
    if (!byEmail.emailVerifiedAt) {
      return prisma.user.update({
        where: { id: byEmail.id },
        data: { emailVerifiedAt: new Date() },
      });
    }
    return byEmail;
  }
  const tenant = await prisma.tenant.create({
    data: { name: `${profile.email.split('@')[0]} workspace` },
  });
  const passwordHash = await hashUnusablePassword();
  const user = await prisma.user.create({
    data: {
      email: profile.email,
      passwordHash,
      name: profile.name,
      tenantId: tenant.id,
      emailVerifiedAt: new Date(),
      oauthAccounts: {
        create: {
          provider,
          providerUserId: profile.providerUserId,
        },
      },
    },
  });
  return user;
}
