CREATE TABLE "DocumentAnnotation" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'comment',
    "content" TEXT NOT NULL,
    "quote" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentAnnotation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSuggestion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fragmentId" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "page" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RagSource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RagSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RagChunk" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "RagChunk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentAnnotation_documentId_versionId_idx" ON "DocumentAnnotation"("documentId", "versionId");
CREATE INDEX "AiSuggestion_documentId_versionId_idx" ON "AiSuggestion"("documentId", "versionId");
CREATE INDEX "AiSuggestion_tenantId_status_idx" ON "AiSuggestion"("tenantId", "status");
CREATE INDEX "RagSource_tenantId_createdAt_idx" ON "RagSource"("tenantId", "createdAt");
CREATE INDEX "RagChunk_sourceId_idx" ON "RagChunk"("sourceId");
CREATE INDEX "RagChunk_tenantId_idx" ON "RagChunk"("tenantId");

ALTER TABLE "DocumentAnnotation" ADD CONSTRAINT "DocumentAnnotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RagSource" ADD CONSTRAINT "RagSource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RagChunk" ADD CONSTRAINT "RagChunk_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "RagSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
