-- 0005 · per-org CV caps on the profile (CLAUDE.md rule 3, lib/editorial/select.ts)
--
-- org_caps maps an org name to the most CV points it may take on one tailored page, so an
-- internship or a part-time role never outweighs the full-time ones. The values are DATA
-- (data/cvbuilder/profile.json `maxPoints`, carried by seed.sql), never a migration.
--
-- Idempotent: safe on the live project and on a fresh project built from schema.sql.

alter table profiles add column if not exists org_caps jsonb not null default '{}';
