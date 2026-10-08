-- NO ACTION, DEFERRABLE INITIALLY DEFERRED (ADR 0037): still refuses deleting a document that an
-- envelope or a template uses, but checks at commit. Deleting a workspace cascades through
-- Organization → Envelope → EnvelopeDocument and Organization → Document in one transaction;
-- Postgres runs those cascades as separate internal statements, so an immediate check (RESTRICT
-- or plain NO ACTION) can fire before the EnvelopeDocument rows are gone.
ALTER TABLE "EnvelopeDocument" DROP CONSTRAINT "EnvelopeDocument_documentId_fkey";
ALTER TABLE "EnvelopeDocument" ADD CONSTRAINT "EnvelopeDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "TemplateDocument" DROP CONSTRAINT "TemplateDocument_documentId_fkey";
ALTER TABLE "TemplateDocument" ADD CONSTRAINT "TemplateDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
