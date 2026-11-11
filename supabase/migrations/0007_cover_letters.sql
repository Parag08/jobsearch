-- 0007 · the cover letter on the application (lib/repos/cover-letters.ts)
--
-- One letter per application, kept on the application row so re-tailoring the CV does not
-- lose it: recipient, firm detail, the three body paragraphs and any voice/honesty issues.
-- Generated text is already a record; the app refuses to change it once the application
-- is sent (frozen with the CV, DESIGN section 2).
--
-- Idempotent: safe on the live project and on a fresh project built from schema.sql.

alter table applications add column if not exists cover_letter jsonb;
