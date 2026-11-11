-- 0008 · the user's tag vocabulary on the profile (lib/editorial/score.ts)
--
-- taxonomy = {tags: {tag: [JD phrases that imply it]}, seniorityHints?}. The CV scorer reads a
-- JD's demand for each tag through it, and bullets carry tags from the same vocabulary. The
-- values are DATA (data/cvbuilder/taxonomy.json, carried by seed.sql), never a migration.
--
-- Idempotent: safe on the live project and on a fresh project built from schema.sql.

alter table profiles add column if not exists taxonomy jsonb not null default '{}';
