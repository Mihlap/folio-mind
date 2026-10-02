-- Presentation.documentId / versionId: ON DELETE SET NULL -> ON DELETE CASCADE.
--
-- A presentation built inside a document is meaningless once that document is
-- gone: every page image and media file it referenced was deleted from S3 with
-- the document, so its slides could only ever render blank.
--
-- With SET NULL the deck silently turned into what the code defines as a
-- "standalone" presentation (documentId IS NULL is exactly what
-- GET /presentations?standalone=1 filters on), so it appeared in the sidebar
-- Презентации section with no images. It also lost document-level access
-- control, because requirePresentationAccess only consults the document ACL when
-- documentId is still set.

-- DropForeignKey
ALTER TABLE "Presentation" DROP CONSTRAINT IF EXISTS "Presentation_documentId_fkey";
ALTER TABLE "Presentation" DROP CONSTRAINT IF EXISTS "Presentation_versionId_fkey";

-- AddForeignKey
ALTER TABLE "Presentation"
  ADD CONSTRAINT "Presentation_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Presentation_versionId_fkey"
    FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Clean up decks already orphaned by the old SET NULL behaviour.
-- The server rejects sourcePage on standalone decks, so a presentation with no
-- documentId whose slides still point at pages is unambiguously a leftover:
-- it is listed in the standalone section but can never render an image.
DELETE FROM "Presentation" p
WHERE p."documentId" IS NULL
  AND p."versionId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "PresentationSlide" s
    WHERE s."presentationId" = p.id AND s."sourcePage" IS NOT NULL
  );