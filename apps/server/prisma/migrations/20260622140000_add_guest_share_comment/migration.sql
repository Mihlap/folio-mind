-- CreateTable
CREATE TABLE "GuestShareComment" (
    "id" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "authorName" TEXT,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestShareComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuestShareComment_documentId_versionId_createdAt_idx" ON "GuestShareComment"("documentId", "versionId", "createdAt");

-- CreateIndex
CREATE INDEX "GuestShareComment_shareLinkId_createdAt_idx" ON "GuestShareComment"("shareLinkId", "createdAt");

-- AddForeignKey
ALTER TABLE "GuestShareComment" ADD CONSTRAINT "GuestShareComment_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "DocumentShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
