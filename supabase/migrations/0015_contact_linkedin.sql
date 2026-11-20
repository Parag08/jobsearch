-- 0015: the Network tab (ROADMAP N1). A contact may carry the LinkedIn profile link the user
-- pasted. It is stored as a link only and never fetched (decided 2026-11-10).

alter table contacts add column if not exists linkedin_url text;
