-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN "confidenceLevel" TEXT,
ADD COLUMN "confidenceScore" INTEGER,
ADD COLUMN "confidenceSummary" TEXT,
ADD COLUMN "confidenceDetails" JSONB,
ADD COLUMN "confidenceAnalyzedAt" TIMESTAMP(3);
