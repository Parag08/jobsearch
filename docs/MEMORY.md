# Work log (newest first)

Keep this file updated at the end of every working session: what was done, decisions taken, what's next. CLAUDE.md holds the stable rules; this holds the moving state. Keep only the last two or three sessions here - move older entries to docs/MEMORY-archive.md so a fresh session stays cheap to start.

## 2026-11-21 - Interviewer realism + past reports (branch fix/interviewer-realism)

From `$FINDPARAGJOB_DIR/tools/portal-sync/interviewer-realism-prompt.md`. Details: docs/FULL-INTERVIEW.md "Realism fixes".
- The model answer is out of the turn prompt. A grounding guard (`lib/interview/grounding.ts`) blocks numbers (digits or words), names, quotes and "you mentioned" claims the candidate didn't say, falling back to an echo of their own words. It also applies to the single mock; the written notes are no longer in scope.
- Double submit fixed on both sides (`turnConflict`; client drops results from a stopped recognition). Turn-taking moved to `lib/interview/turn-taking.ts`, with new env `INTERVIEW_TURN_*` (five keys; unset = hands-free never ends an answer by itself). **Set on Vercel Production + Preview 2026-11-21** (1200 / 4000 / 40 / 280 / 0.05).
- Streaming TTS; `[full-turn]` server and `[interview-latency]` browser timing logs.
- Past reports: full-interview lobby lists every finished interview (Open report); single-question attempts expand to the full report.
- Not done: the choice of a faster `AI_GATEWAY_INTERVIEWER_MODEL` (needs a quality check with a live key).

## 2026-11-20 (late night) - Full mock interview, role-plays, company-first Interview tab (branch feat/full-interview)

Parag: company practice felt generic; wanted one realistic adaptive interview per company (e.g. Cognition) with one debrief, and every question still practisable with a role-play. Mid-build: make the page simple and company-first, but keep general practice for days with no interview. Design and decisions: **docs/FULL-INTERVIEW.md** (code lists moves, model picks; MCP read-back + agent role-plays; interviewer model env).
- Built: plan/session/role-play domain + tests, migration **0017** (not yet applied - `db.yml` applies on push to main), repos, services, actions, `full-interview.tsx`, `role-play-panel.tsx`, page rebuilt around the "Preparing for" strip, MCP `set_role_play` + `rolePlay` on upsert + `fullInterviews` in practice read-back. Demo has a Kestrel AI round with two model answers.
- **Vercel:** `INTERVIEW_FULL_MAX_TOPICS=8`, `INTERVIEW_FULL_TOPIC_FOLLOW_UPS=3`, `INTERVIEW_FULL_TOTAL_FOLLOW_UPS=12` set on Production + Preview (2026-11-20). `AI_GATEWAY_INTERVIEWER_MODEL` not set (falls back to premium).
- Checked in the browser on the demo (canned AI): company page, full interview (probe on a vague answer, debrief with path and moments), role-play build, Practice and its general interview start, Cases links, phone width. **Not checked:** a real model's turns and debrief (no live key used), voice playback of a role-play.
- Next: fit-then-case full interview for consulting firms; number rules that read "nine days".

## 2026-11-20 (night) - Interview prep over MCP (branch feat/mcp-prep)

From a prompt the findparagjob agent wrote (`$FINDPARAGJOB_DIR/tools/portal-sync/mcp-extension-prompt.md`). 11 new tools (26 in all), 2 fixes; listed in **docs/MCP.md**. Migration **0016** (stories external_ref/source/provenance/updated_at with an agent-provenance check; custom questions external_ref/competency/tag). `save_brief` deliberately not built (briefs are derived and overwritten). Interactions now carry ids everywhere (`Interaction.id`). Next: the agent adds matching portal-sync commands once this is merged and deployed.

## 2026-11-20 (evening) - One-click Apply (branch fix/apply-flow)

Parag: Save to pipeline "not working on the live UI"; wanted one **Apply** that pulls everything and lets him apply. Logs couldn't show the failure (Hobby keeps 1h, nothing logged). Code showed why it dead-ended: the board was read only when the role's company was on the watchlist with the same name and a token; anything else said "copy the posting and use Add a job" and stayed on the Watchlist.
- **Apply** (button renamed) always opens the application and goes to it. Board token from watchlist entry, then company directory, then the role's own board link (`boardFor` in `lib/watchlist/posting.ts`). No text -> unread application + **Add the posting** paste box on its page (`readPostingInto`, `readPostingAction`); model failure keeps the text for **Read it**. Failures now log their reason (`console.error`).
- Application page **apply strip**: Open the posting, Download CV, Mark as applied; applying sets "Follow up if no reply by <date>" from **`APPLY_FOLLOW_UP_DAYS`** (new env; **set it on Vercel**, unset = none).
- Demo: roles have example.com links; a Harbour Studio role shows the paste path.

