# Work log (newest first)

Keep this file updated at the end of every working session: what was done, decisions taken, what's next. CLAUDE.md holds the stable rules; this holds the moving state. Keep only the last two or three sessions here - move older entries to docs/MEMORY-archive.md so a fresh session stays cheap to start.

## 2026-09-24 (later) - Case interviewer; interview tab made fast

**Casing tab is now a live case interviewer** (DESIGN.md §3 "Case interviews"). Ten Bain-style,
candidate-led cases in `data/interview/cases.json` - M&A, post-merger, PE due diligence and PE value
creation, all in tech. Ten scouts read the user's casebook library (`Documents\caseprep`); it holds
no case that is both Bain-sourced and tech M&A, so each app case keeps one real case's flow and insight
(Columbia Accountware, Ross C.M. Burns, INSEAD Techking, Stern "PE and a Soda", Real MBB almond farm,
Darden airline marketplace, McKinsey card processor, Emory GenCo, Wharton Going Nuts, Peter K
OmegaMed) re-set in tech with fictional names and numbers. Source map:
`Documents\caseprep\index\app-case-sources.md` (kept out of this public repo). The same pass split the
Peter K book, previously one 420-page index row, into its 24 cases in `caseprep\index`.

What live testing forced, in order: the model never moved a case on (code now closes a question on a
correct math answer or a turn cap); it asked the next question itself (code strips questions from a
closing line); it once stated a wrong sum as fact (code now replaces any line with a figure not in
the case or the conversation); small models emit stray JSON tails (`parseJsonLoose` falls back to the
first balanced value); the gateway allows 5 requests/min per model (rate-limited turns re-send after
the wait). Migration 0002 (`case_sessions`) applied live.

**Interview tab speed:** question/firm switching is client-side (`behavioural-view.tsx`, pushState);
functions pinned to `sin1` next to Supabase (vercel.json).

**Next:** try a case end to end in the browser (needs `AI_GATEWAY_API_KEY` on Vercel for production);
more cases (the runners-up in the source map); case attempts could feed a "weakest dimension" drill.

## 2026-09-24 - Interview prep rebuilt; drop-and-recreate is over

**Schema policy FLIPPED to migrations.** Interview answers are the first data typed by hand
into the app, and nothing regenerates them - the next push touching `schema.sql` would have
wiped them via `db.yml`. Now: `supabase/migrations/NNNN_*.sql` (idempotent), `npm run
db:migrate` (records each in `schema_migrations`, one transaction per file), `db.yml` applies
pending migrations on push and never drops. `schema.sql` stays the full snapshot for a fresh
project; `db-apply` refuses it without `--force-drop`. Applied 0001 live: 131 sourced jobs, 9
watchlist, 71 companies, 23 bullets all survived.

**Interview tab** (`/app/interview`) is now three tabs - Behavioural / Casing / Technical - with
tab, question and firm in the URL.
- Behavioural: 26 MBB questions as DATA in `data/interview/questions.json` (firm tags, what a
  strong answer shows, Bain notes grounded in Bain's public values - not a leaked script).
  Per question: a written answer (blank box OR STAR, both drafts always kept) and spoken
  practice.
- Spoken practice uses browser APIs only - speech synthesis asks the question, Web Speech
  transcribes live (Chrome/Edge; typing fallback elsewhere), MediaRecorder for playback. Only
  the transcript reaches the server; audio is never stored. No new dependency.
- Scoring (`lib/interview/score.ts`): measured first, deterministically - length, pace, "I"
  versus "we", and numbers said aloud that the written answer lacks. Only judgement goes to the
  model (premium tier, JSON mode), output validated and clamped. Verified live: planted a spoken
  40% against a written 30%, and it was caught; model feedback stayed about delivery, never new
  content.
- The one-off story form from 09-24 morning is retired; `lib/stories` stays as the bank.

**Next:** stories/answers are not yet linked to CV bullets, so number consistency against the
*CV* (not just the written answer) is unwired. Application-scoped prep (`prepSet`, built and
unused) is still the highest-value addition.

