-- DropForeignKey
ALTER TABLE "Presentation" DROP CONSTRAINT "Presentation_documentId_fkey";

-- DropForeignKey
ALTER TABLE "Presentation" DROP CONSTRAINT "Presentation_versionId_fkey";

-- AlterTable
ALTER TABLE "Presentation" ALTER COLUMN "documentId" DROP NOT NULL,
ALTER COLUMN "versionId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
