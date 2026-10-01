-- CreateTable
CREATE TABLE "Presentation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "aiMode" TEXT NOT NULL DEFAULT 'none',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Presentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresentationSlide" (
    "id" TEXT NOT NULL,
    "presentationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "body" TEXT,
    "notes" TEXT,
    "layoutVariant" TEXT NOT NULL DEFAULT 'image_top',
    "background" TEXT,
    "sourcePage" INTEGER,
    "mediaAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresentationSlide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Presentation_tenantId_updatedAt_idx" ON "Presentation"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "Presentation_documentId_idx" ON "Presentation"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Presentation_versionId_key" ON "Presentation"("versionId");

-- CreateIndex
CREATE INDEX "PresentationSlide_presentationId_idx" ON "PresentationSlide"("presentationId");

-- CreateIndex
CREATE INDEX "PresentationSlide_mediaAssetId_idx" ON "PresentationSlide"("mediaAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "PresentationSlide_presentationId_position_key" ON "PresentationSlide"("presentationId", "position");

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationSlide" ADD CONSTRAINT "PresentationSlide_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationSlide" ADD CONSTRAINT "PresentationSlide_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
