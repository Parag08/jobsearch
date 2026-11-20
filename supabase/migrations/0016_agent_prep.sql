-- 0016: interview prep an agent can read and write over MCP (lib/mcp/tools.ts).
--
-- stories: an agent may store a STAR story the user told it. Stories stay CAPTURED, never
--   generated (DESIGN.md section 3): `provenance` records where the facts came from ("Parag,
--   in chat 2026-11-20") and `source` who typed them in. `external_ref` is the workspace's
--   stable id, so re-sending a story updates it instead of adding a second.
-- interview_custom_questions: the same `external_ref`, plus an optional competency and tag
--   for drill questions an agent adds.
--
-- Reversible: see the commented "down" block at the end.

alter table stories add column if not exists external_ref text;
alter table stories add column if not exists source text not null default 'user';
alter table stories add column if not exists provenance text;
alter table stories add column if not exists updated_at timestamptz;
create unique index if not exists stories_user_external_ref on stories (user_id, external_ref) where external_ref is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stories_source_check') then
    alter table stories add constraint stories_source_check check (source in ('user', 'agent'));
  end if;
  -- A story an agent stores must say where its facts came from.
  if not exists (select 1 from pg_constraint where conname = 'stories_agent_provenance') then
    alter table stories add constraint stories_agent_provenance
      check (source <> 'agent' or length(btrim(coalesce(provenance, ''))) > 0);
  end if;
end $$;

alter table interview_custom_questions add column if not exists external_ref text;
alter table interview_custom_questions add column if not exists competency text;
alter table interview_custom_questions add column if not exists tag text;
create unique index if not exists interview_custom_questions_user_external_ref
  on interview_custom_questions (user_id, external_ref) where external_ref is not null;

-- down (run by hand to reverse; nothing else depends on these columns):
--   drop index if exists interview_custom_questions_user_external_ref;
--   alter table interview_custom_questions drop column if exists tag, drop column if exists competency, drop column if exists external_ref;
--   alter table stories drop constraint if exists stories_agent_provenance, drop constraint if exists stories_source_check;
--   drop index if exists stories_user_external_ref;
--   alter table stories drop column if exists updated_at, drop column if exists provenance, drop column if exists source, drop column if exists external_ref;
