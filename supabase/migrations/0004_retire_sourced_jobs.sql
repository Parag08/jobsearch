-- 0004 · retire sourced roles that close (lib/watchlist/retire.ts)
--
-- A posting missing from a board that answered, on two refreshes running, is marked
-- `closed` so the open-roles list stops filling with dead links. missed_refreshes
-- counts the consecutive misses; a posting seen again resets it (and a closed one
-- comes back as `new`). A board that fails to answer never counts a miss.
--
-- Idempotent: safe on the live project and on a fresh project built from schema.sql.

alter type sourced_status add value if not exists 'closed';
alter table sourced_jobs add column if not exists missed_refreshes int not null default 0;
