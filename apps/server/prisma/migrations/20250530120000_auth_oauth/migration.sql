ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);

ALTER TABLE "DocumentVersion" ADD COLUMN IF NOT EXISTS "pageCount" INTEGER;

CREATE TABLE IF NOT EXISTS "MagicLinkToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OAuthAccount" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MagicLinkToken_tokenHash_key" ON "MagicLinkToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "MagicLinkToken_userId_createdAt_idx" ON "MagicLinkToken"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "MagicLinkToken_expiresAt_idx" ON "MagicLinkToken"("expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_userId_createdAt_idx" ON "EmailVerificationToken"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "OAuthAccount_provider_providerUserId_key" ON "OAuthAccount"("provider", "providerUserId");
CREATE INDEX IF NOT EXISTS "OAuthAccount_userId_idx" ON "OAuthAccount"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_createdAt_idx" ON "PasswordResetToken"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "MagicLinkToken" ADD CONSTRAINT "MagicLinkToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
