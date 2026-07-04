ALTER TABLE "Document" ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "Document" ADD COLUMN "reviewStatusChangedAt" TIMESTAMP(3);
