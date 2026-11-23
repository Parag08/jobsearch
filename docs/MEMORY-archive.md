# Work log archive (older sessions)

Moved out of docs/MEMORY.md on 2026-09-24 so a fresh session reads only the current state. Newest first. Search here (grep) rather than reading it whole.

## 2026-11-21 (later) - Pause and Discard (branch feat/interview-pause-discard)

PR #29 merged and live. Parag wanted more time to finish answers: **Vercel now has `INTERVIEW_TURN_SILENCE_MS=2500`, `INTERVIEW_TURN_UNFINISHED_MS=6000`** (Production + Preview, redeployed); `.env.example` matches. Added **Pause** (beside Discard) to both interview rooms and **Discard** to the full interview (deletes only a running session). Details: docs/FULL-INTERVIEW.md "Pause and Discard". Checked in the local demo; not on a real mic.

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

## 2026-11-20 (later) - Network tab, ROADMAP N1 (branch feat/networking)

PRs #23 and #24 merged. Parag: "continue the roadmap, next would be networking."
- **Built `/app/network`** (nav after Watchlist): add a person by name or pasted LinkedIn link (name read from the slug; link kept, never fetched), log a conversation (sets status and next follow-up from warmth, or a chosen date), edit warmth / status / follow-up. Follow-ups due lead the page. Rules only, no tokens.
- `lib/networking/contacts.ts` (pure), `lib/services/network.ts`, `listContactsWithInteractions`; migration **0015** `contacts.linkedin_url` (mirrored in schema.sql; `db.yml` applies it on push to main, not yet applied by hand). MCP `upsert_contact` accepts `linkedinUrl`.
- Wired: Pipeline's follow-ups-due fact and panel link to it (the panel used to say "no interaction logged" for everyone because it loaded contacts without logs - fixed); Overview's follow-up step goes there; Watchlist company rows show people you know. Demo has three contacts (one overdue, one not contacted). Process map and architecture graph updated (`outreach` now today/partial, N2 left).
- **Dev gotcha:** the demo visitor store keeps its factory on `globalThis`, so a changed demo seed needs a dev-server restart to show.
- **Next:** N2 first-message draft, or APPLY-FLOW step 2 (Send strip).

## 2026-11-20 - Apply flow designed; Save to pipeline built (branch feat/save-to-pipeline)

Parag: no natural path from roles found -> shortlisted -> pipeline -> applied. Design in **docs/APPLY-FLOW.md** (six steps, build order of four).
- **Built: Save to pipeline** replaces Shortlist on the Watchlist. `lib/watchlist/posting.ts` fetches one posting's text per board (Greenhouse/Lever/SmartRecruiters one-posting endpoints, Ashby whole board) and turns HTML into text; `lib/services/save-to-pipeline.ts` reads it once (processJd), opens the application at Saved with `external_ref = sourced:<job id>` and `apply_url`, marks the role tracked, builds the CV (rules only; a failure is reported, not fatal). Idempotent. No board text -> asks for a paste. Demo uses `cannedPosting`.
- **Next (APPLY-FLOW build order 2):** the Send strip on the application page (Open the posting from `apply_url`, downloads, Mark as applied as primary, follow-up date).

## 2026-11-19 (after #21) - Live demo 500 and page speed (branch fix/live-demo-and-speed)

- **Demo 500 on the live site:** `lib/db/demo.ts` read `data/demo/` with `fs`; Vercel's bundle did not include it (ENOENT `/var/task/data/demo/applications`). Now imported as modules (`lib/demo/corpus.ts`); the scratch production build carries it.
- **Speed:** warm public pages answer in 60-100ms (TTFB, curl from Singapore); first hits after a deploy are 0.5-0.8s cold starts. Signed-in pages called Supabase auth once in middleware and once per `getWorkspace()` caller (layout + page); `getWorkspace` is now `cache()`d per request. Signed-in timings not measured (no session in the browser pane).

## 2026-11-19 (after #19) - Public demo that spends no tokens (branch feat/token-free-demo)

Parag asked for a demo with sample data visitors can click through, worried about token spend, or else a video. Chose the interactive demo: video goes stale, and clicking shows more.
- **Fictional person** Maya Okafor in `data/demo/` (CVbuilder file shapes, made-up companies, `example.com` contacts). The old local demo still loads `data/cvbuilder/` (Parag's real CV) only when Supabase is unconfigured; the public demo never does.
- **`/demo`** sets a random-id cookie; `getWorkspace()` gives that visitor their own FakeDb (`lib/demo/visitors.ts`, two idle hours, at most `DEMO_MAX_VISITORS` per server - unset = demo off, the kill switch). `lib/demo/extras.ts` stages the applications across the pipeline and adds watchlist, roles, answers, attempts, a contact.
- **No tokens:** every model call now goes through `lib/services/ai-write.ts`; with `cannedAi` it answers from `lib/demo/canned.ts` (same parsers and guards run). Postings are read by rules (`lexicalExtract`). Watchlist refresh is a no-op, TTS returns 501 (browser voice), tokens can't be made.
- Landing: "Try the demo" + "Try it with sample data" when the demo is on. Banner in the app shell. DESIGN.md "Demo (`/demo`)".
- **To do on Vercel:** set `DEMO_MAX_VISITORS=200` (Production + Preview), or the links don't show.

## 2026-11-19 (late night) - Bank, Watchlist, Insights, nav, then the rest of the critique (PRs #15-#17, branch feat/critique-pass)

- **Bank (#15):** summary panel, To do sentences linking to roles and points, collapsible roles with monograms, coloured strength bands (strong green, solid teal, weak orange; no-number points capped at 2 as the intake guard does), and **edit any point in place** (wording, strength, family, skills, variants), add a point, delete with a note of how many CVs use it. `lib/bank/display.ts`, `updateBullet`/`deleteBullet`.
- **Watchlist and Insights (#16):** written list first (UI-CRITIQUE.md section 10), then fixed. Roles found first; suggested companies from the directory (was loaded, never shown); Insights in the Overview's words and colours (`lib/insights/display.ts`), rows linking into the Bank. Shared summary styles in `ui.module.css` (`.summary`, `.sumBar`; `.split` was taken by Interview). Nav: Overview, Pipeline, Interview, Watchlist, Insights, Bank, Agent; sign-in lands on `/app/home` (`APP_HOME`).
- **#17:** the JobSearch name is the Overview tab (pill when current); the phone menu lists Overview.
- **Critique pass (this branch):** status of every open item recorded first (UI-CRITIQUE.md section 11). Bank -> **Experience**, Agent -> **Assistant** (labels only; URLs kept). Application page rebuilt: stage stepper in the stage colours, Mark as applied as the one primary, Close application with reasons, labelled Next step, "What they're looking for" as two groups, CV without unexplained scores, cover-letter fields labelled, prep tags in the three meaning colours. Acronyms in labels (MBA, KPI, SaaS). Importer: company casing from the posting (TikTok), plain next-step note; seed.sql regenerated. Landing: no "every day" promise (boards are read when you check), cover letters out of Coming next, demo card 4s per frame. Theme toggle: sun or moon plus an "A" in Auto. Inter bundled (`@fontsource-variable/inter` + `next/font/local`), so builds no longer fetch Google Fonts.
- **Not done:** deleting the merged `feat/blue-premium` branch (blocked by the permission check; Parag to run it); the live database still has the old TikTok spelling and import note until the seed is re-applied; shortlisted Watchlist roles still don't go to the pipeline.

## 2026-11-19 (night) - Overview page from the JobSearch name (branch feat/home-dashboard, off feat/blue-premium, uncommitted)

Parag: the JobSearch name in the menu bar did nothing (it linked to `/`, which middleware sends back to `/app`). It now opens `/app/home`, an overview. His follow-ups, applied: **not** a nav item ("Home" removed); **no Three.js visual** (built, rejected, deleted); keep the streak idea but **one per activity** (jobs applied, people reached, practised) with totals including practice time; a second tab with **insights from what you search for**.
- `lib/home/momentum.ts` (week counts, overall + per-activity streaks, 14-day strips, mood, next steps), `lib/home/practice-time.ts` (attempt length or words at 130 wpm; case turn gaps capped at 10 min), `lib/home/settings.ts` (`HOME_GOAL_*` from env - **set them on Vercel** too). All tested.
- Page: headline + one action; tabs Progress (three streak cards, after-that steps, a tile per page) and Insights (role families read, top 10 requirements with coverage, link to `/app/insights`).
- Light accent `#007AFF` -> `#0071E3` so white button text passes 4.5:1.
- **Checked** in the browser: name -> overview, both tabs, no console errors; 970 tests. **Not seen:** the cards with real activity (demo data has none recent). Signed-in landing is still `/app` (pipeline).

## 2026-11-19 (evening) - Apple-style blue and white re-theme + Kanban pipeline (PR: feat/blue-premium)

Parag: make the UI premium using a YouTube video (7 fixes for AI-looking UI), leaning blue. Compared "Harbour" (navy/cobalt) with an Apple-style mock; he chose **Apple-style, colourful**, and pointed to a Dribbble Kanban (Twinkle) for the pipeline. Standing instruction: keep a DESIGN.md for every project (docs/DESIGN.md section 5 rewritten).
- **Tokens** (`app/globals.css`): iOS grouped grey + white cards, system blue action, a system colour per stage, green progress (`--warm` now green; `--on-warm` for text on it), orange stale, tag tones `--tone-*`, `--track`, `--shadow-card`. Dark = true black + dark-mode system colours. Room = FaceTime dark.
- **Type**: one family, `-apple-system` then Inter (`next/font`); Fraunces and Plex Mono dropped; `--font-serif/--font-mono` alias it; `--font-code` for real code (`ui.code` on the agent page). All uppercase/tracked labels removed.
- **Pipeline**: header = large title + coloured facts line + **Add a job** (sheet grows from the button, `jd-form.tsx` `AddJob`/`AddJobGhost`, opens on an empty pipeline); board = a column per working stage (negotiation only when used, closed folded), grey tracks, lifted cards (role title, company, role-family tag, monogram via `lib/pipeline-display.ts`, tested), empty-column hints, 88rem page via `:has([data-board])`, phone swipe with scroll-snap.
- **Landing**: headline "A CV that only says what you can prove.", one primary button + text link, stat trio cut, step copy rewritten.
- **Checked** in the browser: landing, pipeline (light, dark, 375px), Add a job open/close, interview tab, application page. 943 tests, typecheck clean. **Not done:** Bank, Watchlist, Insights and the application page only inherit the tokens (no layout pass); no drag-and-drop between stages; DESIGN.md mock of the Harbour option is not kept.

## 2026-11-19 (later) - Interview tab bug fixes (PR: fix/interview-tab)

- **Question switch leaked state:** switching questions is client-side, so the notes editor ("Saved.", follow-ups, Blank/STAR mode), the model-answer editor and the mock interview kept the previous question's state. The detail pane in `behavioural-view.tsx` is now keyed by question id.
- **Late replies after leaving a call:** `mock-interview.tsx` has a generation ref bumped by every reset; start/turn/feedback replies and the speak-then-listen step drop out if it moved, so an old reply can no longer take the stage, speak or open the mic. `case-room.tsx` has an `alive` ref for the same reason.
- **Case clock** kept running after a case ended (and showed days on a resumed one): `caseElapsedSeconds` in `lib/interview/case-progress.ts` stops at the last turn once done. **Case cards** counted in-progress attempts as attempts: `caseProgress` counts finished, scored ones and says "one in progress" separately. CaseRoom is keyed by case id too. Tests: `lib/interview/case-progress.test.ts`.
- **Technical tab** said "No Skills or Technologies line" when the lines existed but nothing was backed. **Notes** open by default when a question has no model answer, so "Write your notes below" is visible.
- **Not checked:** real mock turns, debriefs or case replies (no AI key locally); the race fixes are reasoned, not reproduced.

## 2026-11-19 - Front-end critique + P0 fixes

Parag asked for a hard critique of the front end, wording included. Written to **docs/UI-CRITIQUE.md** (sections per screen, P0/P1/P2, Now / Change to copy). Reviewed on the dev server in demo mode at 1366px and 375px; dark mode not checked.
- **P0s:** app nav links vanish under 640px with no menu (`app.module.css:105`); landing nav overflows at 375px; pipeline defaults to "last 7 days" so the board shows nothing; the CV headline says "INSEAD MBA" while "mba" is listed as an honest gap (honesty rule visibly contradicted); sign-in promises an onboarding step that has no screen.
- **Themes:** system-speak in UI copy, five names for the experience corpus (record/bank/evidence/master/points), taxonomy slugs and priority codes rendered as labels, and a palette that matches the generic AI look (`#F4F1EA` oat + terracotta + Fraunces + Plex Mono eyebrows).
- **P0s fixed the same day (PR #9):** `applicationGaps(jd, bank, projects)` now counts the role heading a bullet sits under as evidence, whole words only (tests in `lib/editorial/gaps.test.ts`; both callers pass projects); the pipeline always opens on every application and `PIPELINE_RECENT_DAYS` only sizes an opt-in "Only the last N days" link (`?show=recent`; old `?show=all` links still work); below 640px the app nav folds into a menu button naming the current page with a glass sheet (`nav-links.tsx`); landing hides Sign in under 480px and the hero text no longer waits on `Reveal`; sign-in no longer promises an onboarding step. Checked in the browser at 375px and desktop, demo mode.
- **Next:** the vocabulary/copy pass, then a real board + stage stepper, then a palette study.

## 2026-11-19 - Agent (MCP) safety hardening

Parag asked for a safety review of the agent workflows, then a PR for the five gaps found.
- **Tokens (migration 0014, mirrored in `schema.sql`)**: `scope` read|write (existing rows: write), `expires_at` (existing rows: 90 days from migration), `window_start`/`window_count` for a 60/min per-token rate limit (`lib/agent/rate-limit.ts`, 429 + Retry-After). `/app/agent` picks scope and 30/90/365 days and lists both.
- **MCP**: every tool has `annotations`; read tokens only list/call read-only tools; `set_stage` closed and `set_model_answer` force need `confirmedByUser: true`; batch max 20, `jdRaw` max 60k, at most 3 posting reads per request (`capReads`), body cap counts bytes.
- **Prompts**: data-not-instructions lines in JD extraction, mock follow-up/debrief, scoring and rewrite; server instructions say returned postings/transcripts/notes are data.
- **SECURITY_MODEL.md** no longer says the MCP path makes no LLM calls.
- **Ship:** merge, db.yml applies 0014. Existing tokens keep working (write) and expire 90 days after the migration runs.

## 2026-11-18 (evening) - Model answers (agent, AI rewrite, user), comparison, fillers

Parag: wants a model answer per question - from the agent, or the app's AI rewriting his own written answer, or edited by him - then to speak and be compared, with filler feedback. All of it over MCP too.
- **Migration 0013**: `interview_model_answers` (user_id, question_id unique; text; source agent|ai|user). Replaced an earlier unmerged draft that put a column on role questions.
- **Write path**: `setModelAnswer` only. MCP `set_model_answer {questionId, text, force?}` and `modelAnswer` on `upsert_interview_questions` (returns `modelAnswers {saved, keptYours}`); `list_interview_questions` returns `modelAnswerSource`; `list_interview_practice` returns `modelAnswer`.
- **App**: "Rewrite as model answer" on the notes editor (saves the draft first; premium call; `guardRewrite` refuses added numbers); `ModelAnswerPanel` shows source, Edit/Save (source user), or "write one yourself" when empty.
- **Debrief**: compares with the model answer (`comparison`), numbers checked against written + model; Fillers block on every debrief (`fillerReport`, 2 per 100 words threshold).
- **Checked in the browser (demo + temporary seed)**: empty state -> write -> save shows "Written by you"; rewrite saves notes then reports the missing AI key; Cognition question shows "Prepared by your agent". **Not checked**: a real rewrite or debrief with a model; comparison and fillers are not stored with the attempt.

## 2026-11-18 (later) - Practice read-back over MCP

- MCP tool `list_interview_practice` (read-only): per question, written answer + newest attempts (transcript, scores, strengths, improvements). Scope by application, question ids or `since`; `attemptsPerQuestion` 1-10, default 3. Tests in `lib/services/interview-practice.test.ts` and `lib/mcp/server.test.ts`.
- Role interviews (below) shipped 2026-11-18: PR #5 merged, 0012 applied, Cognition DE set (12 questions) pushed.

## 2026-11-18 - Role interviews over MCP

Parag: build the interview for a real round (Cognition Deployed Engineer, technical interview 24 Nov) on the Interview tab, and let the agent do this regularly.

- **New:** `interview_role_questions` (**migration 0012**, mirrored in `schema.sql`), `lib/interview/role-questions.ts` (ids `role:<row id>`, input schema with limits: 40 per set, text 500, lookFor 1000, context 1500), `lib/repos/role-questions.ts`, `lib/services/role-interview.ts`, MCP tools `upsert_interview_questions` / `list_interview_questions` / `remove_interview_questions`.
- **Interview tab:** role questions come first under Company for that application's company, with "Round:" and "Interview brief:" in What good looks like. Mock follow-up and debrief prompts take optional `interviewer` and `contextLabel` (role questions set them; everything else unchanged).
- **Checked in the browser (demo, temporary uncommitted seed of the Cognition set):** list under Company (12 role + 3 template), rubric/round/brief shown, mock starts on a role question. **Not checked:** follow-ups and debrief with a model (no key locally), live DB, mobile width.
- **Ship:** merge, db.yml applies 0012; then findparagjob pushes sets with `npm run portal -- interview <file.json>`.

## 2026-11-16 (later) - Interview: generic questions first, company on demand, ask your own

Parag: company questions crowded out the questions he practises daily; he also wants to type any question and be scored on it.

- **Chooser above the question list: General / My own / Company** (`app/app/interview/behavioural-view.tsx`). The tab opens on the generic bank with the first unpractised generic question selected; Company shows a select with one entry per live application's company and only that company's three questions; the mock interview runs on whatever is selected, so it follows the same default. View rules are pure and tested in `lib/interview/scope.ts` (URL: `company=<slug>`, `scope=mine`, `q=`; an old `q=company:...` link still opens that company).
- **Bank data:** added `fit-about-yourself` (now first), `fit-strengths`, `fit-aspirations` to `data/interview/questions.json`; weakness and why-MBA were already there. New `customQuestion` entry = the rubric every typed question is scored against.
- **My own questions:** `lib/interview/custom-questions.ts` (ids `custom:<row id>`, `cleanQuestionText` = one line, no control characters, refused over the limit), `lib/repos/custom-questions.ts`, table `interview_custom_questions` (**migration 0011**, mirrored in `schema.sql`). `findQuestion` (`interview/bank.ts`) resolves custom ids, so notes, mock interview and scoring are the existing path (`mockFeedbackAction`; there is no `scoreAnswerAction` any more). The two mock prompts get one extra rule line for typed questions (`questionFromCandidate`). Removing a question deletes only its row; its notes and attempts stay in the DB, unseen.
- **Setting:** `INTERVIEW_CUSTOM_QUESTION_MAX_CHARS=300` (`.env.example`, local `.env`). Unset = the add box is not offered.
- **Demo mode fix:** `lib/db/demo.ts` now caches the FakeDb on `globalThis`; pages and server actions were separate module instances, so nothing saved in the demo ever showed.
- **Checked in the browser (demo, dark, desktop width):** default list, company chooser, add a question, join the mock on it, save notes, remove. **Not checked:** a scored attempt on a typed question (no model key locally), mobile width, the live DB.
- **Shipped 2026-11-16:** pushed to main (db.yml applies migration 0011); `INTERVIEW_CUSTOM_QUESTION_MAX_CHARS=300` set on Vercel (production + preview).

## 2026-11-16 - Roadmap rewrite, architecture doc, 3D architecture page

- **`docs/ROADMAP.md` rewritten.** Items now have stable ids by track (S, N, A, I, V, O, X, G, P, Q, U); horizons H0-H4 each with an exit test; measures; risks; idea backlog; a maintenance checklist in section 0. Status tables corrected (mock interview and voice are shipped; sourcing cron marked failing). Old item numbers are mapped in its log.
- **`docs/ARCHITECTURE.md` added:** today's seven layers, twelve weak points (W1-W12) each tied to a roadmap item, the planned additions with a "make it when" trigger, what must not change, and a decision table.
- **`lib/architecture/graph.ts`** (pure, 21 tests): 49 nodes (35 today, 14 planned), edges, eight flows (six today, two planned; each step has a plain-language `say`), `layoutGraph` for the whole system (today's nodes centred, planned ones on an extension to the right) and `layoutFlow` for one flow. Single source for the diagram.
- **`/architecture`** (`app/architecture/`, public, client-only Three.js with OrbitControls + CSS2DRenderer). **Parag found the first version (all 49 parts at once) too complicated, so it is now one small diagram per flow:** a picker of flows, only that flow's parts on the stage, a step list that auto-plays (Back / Pause / Next) with a packet travelling the current step. "Whole system" is the last choice and holds the Today / Future switch. Select a block for detail. Sways gently until touched; `prefers-reduced-motion` stops sway, dots and auto-play; the loop pauses off screen. Parag confirmed the page stays public.
- **Checked in the browser (dev, light theme):** flows (read, tailor, mock interview, overnight), auto-play and step selection, and the whole system in Future, at desktop width; a flow at 375px. `next build` passes (`/architecture` is static, 16.9 kB). **Not checked:** dark theme, reduced motion, touch dragging. Committed and pushed to main 2026-11-16.
- **Next:** ROADMAP Now starts with S1 (sourcing secrets), A9 (reseed live), Q1 (verify on real data), P5 (backups).

## 2026-11-15 - Compact pipeline board

The 7-day window did not shorten the board (the agent had pushed every role within the week), so the layout changed instead:
- Only stages with cards get a column, sharing the full width; empty stages are named in one line under the board.
- Cards flow side by side inside a column (`.colCards`, auto-fill grid), newest activity first (`byRecentActivity`), with one-line company, two-line role, one-line next action.
- `PIPELINE_COLUMN_MAX` (set to 9): a column shows that many cards, the rest fold under "Show N more" (`<details>`). Unset = all cards.
- Git author for this repo is now set (Parag's Gmail); earlier commits from this Mac used a made-up `.local` address and do not count on the GitHub profile.
- Shipped to main with `PIPELINE_COLUMN_MAX=9` on Vercel. Checked on demo data (5 cards) only, not against the real list.

## 2026-11-14 (later) - Role knowledge base: read agent-added roles, Role insights, gap plan

Goal (Parag): after 2-3 weeks of an agent pushing roles, see what PM and forward-deployed-engineering roles ask for and plan how to close the gap.

- **Roles pushed over MCP are now read.** `lib/services/read-role.ts` (`extractRole`, `readRole`, `readUnreadRoles`) is the one place a posting becomes a JdExtract; `processJd` and `agent-sync.upsertApplication` (when given `llm`) both use it. A failed read still saves the role. `upsert_application` returns `skillsRead` / `readError`.
- **`lib/insights/role-insights.ts`** (pure, rules only): `roleFamilies`, `selectRoles({family?, title?})`, `roleInsights` -> requirements ranked by roles asking, grouped through the profile taxonomy, each `evidenced` (a bullet), `unstated` (project narrative/outcomes/skills mention it, no bullet) or `gap`. `topGaps` feeds the plan.
- **Gap plan:** `lib/insights/plan.ts` (brief + prompt: terms, shares, role names only; never claim a gap as experience), `lib/services/role-plan.ts` (`draftRolePlan`, one premium call), stored in `role_plans` (migration 0010, `lib/repos/role-plans.ts`), keyed by `planKey(selection)`.
- **Page `/app/insights`** (nav "Insights"; `app/app/insights/`): family chips + title filter, stats, Gaps / Unstated / Backed lists, "Read them" for unread roles, "Draft a plan".
- **MCP tool `role_insights`** (no args = families + unread count; family/title = requirements + stored plan).
- Settings: `ROLE_READ_BATCH=5`, `ROLE_PLAN_MAX_GAPS=8` (`lib/insights/settings.ts`; unset = that button is off).
- Built with Sonnet subagents for the plumbing (storage, page, MCP tool); design and review on the main model.
- **Shipped 2026-11-14:** commit 736b921 on main; migration 0010 applied by db.yml; `ROLE_READ_BATCH` and `ROLE_PLAN_MAX_GAPS` set on Vercel; production deploy READY. **Not verified:** the page was checked on demo data only (tag demand, no gaps), so the Gaps/Unstated lists and both buttons have not run against real roles or a real model.
- **Noticed:** the daily `sourcing` workflow fails every run: repo secrets `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are missing, so the watchlist is not refreshing on schedule.
- **Known limit:** the role family is the extractor's free label, so "forward-deployed-engineering" may arrive as "engineering" or "solutions-engineering"; the title filter covers that for now. Next: give the extractor the user's own family list.

## 2026-11-14 - Pipeline board shows the last week by default

- `/app` board lists only applications with activity (applied, moved or saved) in the last `PIPELINE_RECENT_DAYS` days; a line above the board says "N of M" with a "Show all" link (`/app?show=all`). Stats still count everything.
- `lib/pipeline.ts` `recentApplications`, `lib/pipeline-settings.ts` `pipelineRecentDaysFromEnv` (unset = show everything, no toggle). Both tested.
- Shipped: commit 9068011 on main; `PIPELINE_RECENT_DAYS=7` is set on Vercel (all environments) and production was redeployed after it. Not yet looked at signed in on the live site.

## 2026-11-13 - MCP server + findparagjob sync

- **Shipped:** `/api/mcp` (stateless MCP over JSON-RPC, `lib/mcp/`), nine tools (pipeline_summary,
  list/get/upsert_application, set_stage, list/get/upsert_contact, log_interaction), token auth
  (`/app/agent`, `api_tokens`, migration 0009 which also adds `applications.external_ref`,
  `apply_url`, `status_note` and `contacts.external_ref`). Rules in `lib/services/agent-sync.ts`.
- **Decided:** stage and contacts are owned by this app; the CV corpus stays owned by findparagjob.
  findparagjob has the client: `tools/portal-sync/` (`npm run portal:push` / `portal:pull`), token in
  its `config/settings.local.json`.
- **Not done:** imported applications have `jd_raw` but no `jd_extract` (extraction costs an LLM
  call each; the detail page says "paste the posting first"). A "Extract from stored JD" button is
  the natural next step. No contacts page yet - contacts are visible only over MCP. Live DB still
  needs `npm run db:seed` for the 11 Nov corpus (unchanged from the entry below).

## 2026-11-11 (evening) - live fixes, then the findparagjob rebuild (step 1 of 6)

- **Live fixes, pushed:** sector lookup used a bare JS array in `.eq()` (PostgREST wants a
  `{...}` literal: `pgArray()` in lib/repos/db.ts; FakeDb now rejects bare arrays). `tailorCv`
  falls back to the best-fitting master when the JD's free-text role family has none
  ("account-management"), and shows the reason on the page instead of crashing. `buildDiff` no
  longer empties the page: a zero-score master bullet goes only to make room for a scoring one.
  "Re-tailor from the master" button on unsent CVs.
- **Vercel logs:** MCP works (team `team_nw5LuDhmwAd4Qeue9PzHtdQN`, project `jobsearch`); Hobby
  keeps ~1h, so use `get_runtime_logs` with `since <= 55m`.
- **Why the rebuild:** Parag's real CVs come from the findparagjob workspace
  (`~/Downloads/findparagjob`, read its AGENTS.md + docs/cv-writing.md + docs/cv-tooling.md).
  JobSearch's output was nowhere close. Plan: (1) sync data - DONE, (2) port its scorer
  (taxonomy tags, `tools/cv-builder/lib/score.js`) and repetition check (`overlap.js`),
  (3) port its exact layout/measurement (`render.js`, `metrics.js`: INSEAD one-page, photo),
  (4) cv-writing.md selection rules (Nutanix <= ~1/3 of lines, one example per competency, XYZ,
  last line >= 50% full) + honest per-application rewording, (5) cover letter vs the sent letters
  in `applications/*/cover-letters/`, (6) benchmark: run the AWS TAM JD and compare with
  `applications/amazon/amazon-senior-tam-enterprise-support-asean.json`.
- **Step 1 done:** `npm run data:sync` (FINDPARAGJOB_DIR in .env) copies profile/points/taxonomy/
  archetypes + the already-imported application files verbatim; caps moved to
  `data/cvbuilder/org-caps.json` (repo-owned). Seed rebuilt: 34 active bullets. Fixed stale facts:
  phone, Dependant's Pass line, Nutanix dates, Touchnote title. **Live DB still has the old data
  until `npm run db:seed`** (needs DB creds; may overwrite in-app bullet edits).
- **Step 2 done (scorer):** `lib/editorial/score.ts` ports findparagjob `score.js` - tag demand
  through the user's taxonomy + word echo, nudged by strength and recency (from role dates).
  Two fixes over the original: single words match plurals, tokens drop edge punctuation (it
  missed every sentence-final word). `withExtractDemand` lets the extract's skills count for
  same-named bullet tags. Taxonomy lives on `profiles.taxonomy` (migration 0008, seeded).
  `JdExtract.signals` computed by code at intake (`processJd`); `tailorCv` backfills it once
  from `jd_raw` for older applications, scores with it, and passes relevance to `buildDiff`.
  **Live taxonomy is empty until `npm run db:seed`**; until then live scoring = extract + echo.
- **Benchmark (AWS AAIS TAM JD, real data, demo DB):** 6/12 of the hand-made AWS TAM CV's
  experience bullets match. Gaps are selection, not scoring - 6 Nutanix bullets (rule: <= ~1/3),
  no Amantya (master-diff never adds a missing role; findparagjob keeps >= 1 per role), no
  overrides. So step 4 should replace "diff from master" with findparagjob's whole-pool
  `autoSelect` (role floor, maxPerRole, budget) + the cv-writing.md balance rules, keeping pins
  and the honesty rule. Run script kept out of repo; recreate from this note.
- **Step 4a done (selection):** `lib/editorial/auto-select.ts` picks from the whole bank when the
  CV_MAX_BULLETS / CV_MAX_PER_ROLE / CV_MIN_PER_ROLE / CV_MAX_ORG_SHARE / CV_COLLISION_OVERLAP env
  settings are set (`cvSelectionSettingsFromEnv`; unset = old master-diff path). Rules: pins, every
  role keeps its best bullet, fill by score, per-role and per-org caps, one story per competency
  (rarity-weighted tag overlap, deferred not rejected), org share judged on the finished page
  (trim the org's weakest, refill). JD-echoing variant applied (`suggestedVariant`). Values: 16 /
  4 / 1 / 0.34 / 0.35. **Set the same five in Vercel.**
- **AWS benchmark now 7/12** of the hand CV's stories. Remaining gaps: (a) findparagjob
  `points.json` tags `nutanix-government-migration-recovery` only engineering + team-leadership, so
  it scores 6.0 - a data fix there (cloud-infra / ops-execution / customer tags); (b) close calls
  (Valeo route app vs ops cost, Touchnote API vs Trendsetter); (c) no per-application rewording yet.
  **Next: step 4b** - honest rewording (overrideText) via the premium model, constrained to the
  bullet's own facts (findparagjob docs/cv-writing.md §3-5: XYZ, numbers unchanged, last line
  >= 50% full), checked by code before it is kept.
- **Repo is PUBLIC** and data/cvbuilder holds personal data (phone, email, bullets). Parag said that is fine
  (2026-11-11); moving the corpus out of the repo is an optional follow-up.

## 2026-11-11 (later) - ROADMAP Now #1, #3, #4: auto sourcing, a sendable CV, cover letters

- **Sourcing:** `lib/watchlist/retire.ts` (pure, 7 tests) closes a role missing from a board that
  answered on 2 refreshes running; failed boards never count. `refreshWatchlist` now also keeps the
  user's status (a re-run used to reset dismissed rows to new) and reports `retired`. New status
  `closed` + `missed_refreshes` (migration 0004). Daily cron `.github/workflows/sourcing.yml`
  -> `npm run watchlist:refresh`. **Needs repo secrets SUPABASE_URL + SUPABASE_SECRET_KEY.**
- **CV:** `tailorCv` now runs the editorial layer: per-org caps from profile `org_caps` (migration
  0005; data = `maxPoints` on Valeo and EverHaus in `data/cvbuilder/profile.json`, seed regenerated),
  then `fitToPage` when CV_PAGE_SIZE/CV_SCALE/CV_OVERHEAD_LINES are set (21 = calibrated so every
  CV in `data/cvbuilder/applications` fits). Decisions/actions/fit stored on `diff.editorial` and
  summarised on the application page. **Live caps apply only after `npm run db:seed`.**
- **Export:** `lib/export/{resolve-cv,docx,pdf,letter}.ts` - one ResolvedCv for both formats,
  frozen text once sent. `/api/export/<id>?format=pdf|docx[&doc=letter]`. Live mode keeps a copy in
  private bucket `cv-exports` (migration 0006, per-user folder policies; env CV_EXPORT_BUCKET) and
  writes `application_cvs.file_path`. Checked on all 5 real demo CVs.
- **Cover letter:** `lib/cover-letter` (brief, prompt, voice checks, assembly) +
  `lib/services/cover-letter.ts`; stored on `applications.cover_letter` (0007). Code owns date,
  salutation, the ¶3 opener, logistics, close and the triad variant (`data/cvbuilder/letter-bank.json`);
  the model (premium tier, gateway) writes three paragraphs. No firm detail -> asks, never invents.
  Checks: contractions, enthusiasm words, numbers not supplied, 3 paragraphs, word range. Editable;
  frozen once sent. The private letters corpus is NOT used yet.
- Tests 665 -> 714. Login work (Get started straight to Google, One Tap, G logo) was done in a
  separate session on branch `feat/google-one-tap` (a356a87), not merged here.

**Next:** collision audit into tailorCv; letters corpus from a private bucket; show "Why this
bullet" from `diff.editorial.decisions`. (`feat/google-one-tap` merged into main the same day.)

## 2026-11-11 - One-click Google sign-in + One Tap (merged from feat/google-one-tap)

- Landing CTAs post directly to `signInWith("google")` (no `/signin` detour) when Supabase is
  configured; demo mode still links to `/signin`. Hero CTA is now the official Google button.
- Google One Tap on `/` (FedCM, hashed nonce, `signInWithIdToken`), only with
  `NEXT_PUBLIC_GOOGLE_CLIENT_ID` + Supabase set and no session. Pure helpers + tests in `lib/auth/`.
- `GoogleButton` / `GoogleMark` components follow Google branding (light + dark); `/signin` uses them.
- **Setup still needed for One Tap in prod:** Google Cloud OAuth client -> Authorized JavaScript
  origins (prod domain + `http://localhost:3000`); Supabase -> Auth -> Google provider -> add the
  same Web client ID to "Client IDs"; Vercel env `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. See UI-REVIEW B2.

## 2026-11-11 - Sage Studio re-theme + Google Tag Manager

Parag found Heather "too plain". After comparing nine theme mock-ups (inspired by WTTJ, Teal,
LeetCode, FT, Linear and others), Parag picked **Sage Studio**.
- `app/globals.css`: new tokens. Oat canvas `--paper #F4F1EA`, cards `--card #FBF9F4` (`--surface`
  aliases it), sage `--accent #4F6F52`, plus a NEW fenced second colour `--warm` (terracotta
  `#C96A3F`, with `-text`/`-wash`) used only for progress. Stage scale is sage and turns warm at
  offer. Radius is now 6/16/24. Forest-ink dark twin. New `--room-*` tokens for the interview
  stage, which replace every hardcoded violet in `app/app/ui.module.css`.
- Warm is applied to: offer/negotiation stages, practised question dots, the speaking status dot,
  the landing page's second ambient glow, and the favicon's final dot. More "progress" places can adopt it.
- Fonts: Fraunces (display) + DM Sans (UI) replace Newsreader + IBM Plex Sans. Plex Mono stays.
- DESIGN.md §5 is rewritten to match, including the amended "one accent" rule (one accent plus
  one fenced progress colour). Stage chip contrast checked: lowest is 4.6:1.
- GTM: `app/layout.tsx` loads the standard GTM snippet + noscript iframe via `next/script`, only
  when `NEXT_PUBLIC_GTM_ID` is set (now in `.env` and `.env.example`). **Must also be set in Vercel**
  for production. Verified locally: the `gtm.js` event fires.

**Next:** engagement ideas not yet built: practice streak/heatmap, score ring in the interview
room, week-over-week deltas on the stat cards, a "Today" card, and collapsing empty pipeline columns.

## 2026-11-09 - Security scan + threat model (Devin)

Added `SECURITY_MODEL.md` at the repo root: trust boundaries, named components, entry points, assets,
attackers and the owner's risk decisions (open OAuth sign-up is intended; LLM keys are capped / free
tier so quota abuse is low impact; nothing out of scope). Security scans start from it, so update it
when a boundary, entry point or risk decision changes. No code or schema change.
- First scan found 3 low findings: no max input length / rate limit on AI server actions and
  `/api/jd`, and an unchecked `next` redirect in `app/auth/callback/route.ts`.

**Next:** the findings are optional hardening (cap prompt text length; validate `next` is a relative path).

## 2026-11-10 (late) - Delivery measured from your voice, in the page

Parag asked whether tone, modulation, breaks and fillers were analysed - they were not.
Step 1 (on-device, $0) is built; step 2 (ElevenLabs/other transcription that keeps "um"/"uh",
which sends audio out and costs credits) is NOT built and would need an opt-in.
- `lib/interview/voice.ts` (pure, 19 tests): `pitchHz` (YIN, 70-400Hz, ~1.5ms per 2048-sample
  frame), `summarizeVoice` (speech by adaptive RMS threshold; pauses >= 600ms inside the answer,
  longest pause, words/min over first-to-last word, median pitch, pitch SD in semitones),
  `combineVoice`, `hedgeCounts` (basically, sort of, kind of, you know, I guess, I mean,
  actually, literally, um/uh/erm when they survive; "like" deliberately not counted),
  `deliveryNotes` (fast > 175 wpm, slow < 115, flat < 2 semitones, choppy > 12 pauses/min,
  hesitation >= 3s, hedging >= 3), `voicePromptLine`, `parseVoiceSummary` (zod).
- `speech.ts` `openMicLevel(rms, pitch)` now also returns `sample()` (float RMS + pitch).
  `mock-interview.tsx` samples every 50ms while listening, summarises per answer, commits the
  summary only when the answer is accepted, and sends `combineVoice(...)` with the feedback
  request. Only numbers leave the page.
- `mockFeedbackAction` validates the summary, counts hedges from the transcript, adds the measured
  line to the debrief prompt (one delivery improvement at most, "never guess at tone"), and returns
  `voice` + `hedges`; the page shows a "Delivery - measured from your voice" section.
- Not stored: `interview_attempts` has no column for it (would need a migration).
- Untested end to end: needs a real microphone and the AI key (live site).

## 2026-11-10 (night) - Company questions instead of firm filter; quieter interview page

**Parag: behavioural questions should not be firm-specific; company questions should be "Why X?".**
- `lib/interview/company-questions.ts` (pure, 10 tests): `companyQuestions(apps, templates)` - one
  set per company with a live (not closed) application, newest activity first, applications to
  one company merged (newest role wins). Templates are DATA (`companyQuestions` in
  `data/interview/questions.json`: why / role / value, each with a `short` list label). `context`
  is only the JD extract's role, top skills, sector, location. `fit-why-firm` was removed from the
  bank (its advice moved into the "why" template); an old answer to it, if any, is orphaned.
- `app/app/interview/bank.ts`: `findQuestion(db, userId, id)` resolves bank or company questions;
  every action uses it (save answer, mock start/turn/feedback). The `firm` parameter is gone from
  the actions, the page and the application page's links. `scoreAnswerAction` and
  `practice-panel.tsx` were removed; `ScoreCard` lives in `score-card.tsx`.
- `MIN_FOLLOW_UPS` is now 0: "none (one answer)" is the quick practice mode.
- UI, from the review: stage-first (no card), Join on the stage, gear opens a settings strip
  (localStorage `jobsearch.mock-interview`), status dot, icon call bar along the stage foot with
  "Done answering" only when typing / not hands-free and there is text, End apart on the right;
  question list with status dots (empty / half = notes / full = practised), company names as
  sub-headings; "What good looks like", "Your notes", "Your attempts" are disclosures; the
  "What your CV already evidences" block became a chip on the guidance line; tabs reordered to
  Behavioural, Technical, Casing. Light mode gets a softer stage. The orb sits higher (`lift`)
  and shrinks on short stages (phones).
- Checked locally with the voice blocked (zero credits): desktop dark + light, phone, settings,
  join, typing. Real follow-ups still untested locally (no AI key here).

## 2026-11-10 (evening) - The mock interview becomes a meeting with an AI agent

Parag: the text thread did not feel like an interview; make it a meeting with an animated AI
agent (Three.js). `mock-interview.tsx` now has a lobby (agent idle, settings, "Join the
interview") and a room: stage with the agent, status ("Your turn", "Listening", "Thinking…",
"Speaking"), clock and follow-up count, live captions (the interviewer's words roll in step
with its audio; your words while you talk; its last line stays up otherwise), a "You" tile
with a mic meter, and meeting controls (Mute/Unmute, Done answering, Type instead, Captions,
Transcript, End and get feedback). Opens with a spoken "Hi, thanks for joining." when the voice
is on. Feedback appears under the stage at the end.
- `agent-avatar.tsx`: `three` (new dependency, loaded with `import("three")` only when the panel
  opens). Shader orb with simplex-noise displacement + particle ring; looks per state ease
  in; reads `getState`/`getLevel` per frame (no React re-render); stops off screen; falls back
  to a CSS orb without WebGL.
- `lib/interview/agent.ts` (pure, 14 tests): `agentState`, `rmsLevel`, `smoothLevel`, `captionWindow`.
- `speech.ts`: `primeAudio()` (call in the click), `speechActivity()` (speaking / level /
  progress; ElevenLabs audio goes through an AnalyserNode only if the AudioContext is running,
  browser voice uses word-boundary pulses), `onSpeakingChange`, `openMicLevel` (meter only, not
  routed anywhere).
- Checked locally with voice off and /api/tts blocked (zero credits): lobby, join, caption,
  typed answer, missing-AI-key message. Not yet seen with the live voice or the real follow-ups.

## 2026-11-10 (later) - Behavioural mock interview with follow-ups (same branch)

**Parag is done with MBB cases; behavioural is the focus now.** New panel "Mock interview" on
`/app/interview` (behavioural tab), above "Practise out loud": the interviewer asks, you answer,
it pushes back with follow-ups, and feedback comes only at the end.
- `lib/interview/mock.ts` (pure, 30 tests). CODE owns the path: `probeCandidates` finds gaps by
  rules (number said but not in the written answer > "we" over "I" > no number in anything said >
  latest answer < 30 words > no reflection words > `depth` as last resort), never repeats a probe,
  and `nextStep` closes at `maxFollowUps` (1-4, picked in the UI, default 3) or when nothing is left.
  The model only phrases the probe from the offered list (`parseFollowUp` forces a valid kind);
  `guardFollowUp` swaps any line stating a number nobody said for `FOLLOW_UP_FALLBACK`.
  Tone friendly / neutral / tough goes into the prompt.
- Actions: `startMockAction` (no model), `mockTurnAction` (small tier; model failure -> stock
  follow-up, rate limit -> retry), `mockFeedbackAction` (premium tier; six dimensions + a
  held/partial/weak verdict per follow-up; saved via `saveAttempt` so it joins "Your attempts").
  No schema change: the session lives in the page (zod-validated on every call) until feedback;
  a refresh mid-interview loses it.
- Hands-free: `speak()` now resolves when the line ends; the page then listens and sends after
  2.5s of silence (`SILENCE_MS`). Typing always works.
- Verified locally only up to the model call (no AI_GATEWAY_API_KEY on the laptop, and Parag
  asked to keep test credit use low). The follow-up and feedback model calls are untested live.

## 2026-11-10 - ElevenLabs voice for the interviewer (branch feat/elevenlabs-voice)

Spoken practice ("Ask me the question") and the case room now speak through ElevenLabs when the
server has it configured, else the browser voice as before. Text only goes to ElevenLabs; answers
are still transcribed by the browser and never reach ElevenLabs.
- `lib/adapters/elevenlabs.ts` (pure, 9 tests): `ttsConfigFromEnv` (null unless all five
  `ELEVENLABS_*` vars are set - no code defaults), `ttsRequest`, `ttsLedgerEntry` (characters
  logged to token_ledger as module `interview-tts`, model `elevenlabs/<model>`).
- `app/api/tts/route.ts`: 501 when unconfigured (client falls back and stops asking), 401 signed
  out, 400 empty/over `ELEVENLABS_MAX_CHARS`, 502 upstream failure; streams audio/mpeg back.
- `speech.ts`: `speak()` is now async and tries /api/tts first; `stopSpeaking()` replaces every
  direct `speechSynthesis.cancel()`. practice-panel no longer calls speechSynthesis itself.
- Verified locally: unconfigured -> 501 -> browser voice; with Parag's key the interview page
  plays ElevenLabs audio (200, audio/mpeg) and the browser voice stays silent. Voice is the
  premade "George" (`JBFqnCBsd6RMkjVDRZzb`) for now. The key is text-to-speech only, so it cannot
  list voices - copy IDs from the ElevenLabs Voices page (about 20 characters).

**Next:** add the five vars on Vercel and redeploy; swap the voice if Parag picks another. A case-room turn
longer than ELEVENLABS_MAX_CHARS falls back to the browser voice for that turn.

## 2026-10-29 - Interview prep on the application page (ROADMAP Now #2, shipped)

`/app/applications/[id]` has a new panel, "Interview prep for this application": for each competency
the JD implies (`inferCompetencies` via `prepSet`'s gap report) it shows **story ready** (the story's
Result), **CV line only** (the first line on this application's CV that evidences it, plus a count of
others), or **gap**, with a "practise" link to the first bank question with that competency
(`/app/interview?tab=behavioural&firm=all&q=<id>`) and a "question bank" link. A collapsed list
shows each CV line with its backing story (pinned or same-project), "needs a story", number
mismatches, and CV ids no longer in the bank. Rules only, zero tokens.
- New pure helper `lib/stories/prep-view.ts` `competencyPrep` (7 tests); exported from `lib/stories`.
- CV line text on the page now goes through one `shownText` (override > chosen variant > bank text).
- Process map step "Prep for this exact application" lost `coming` and is now `auto`.
- No schema change. `stakeholder-management` has no bank question, so it shows no practise link.

**Next:** no form writes `stories` yet, so live prep shows only "CV line only" or "gap". A story
capture form (`draftStory`/`saveStory`) is the natural follow-on; otherwise ROADMAP Now #1 / #3.

## 2026-09-25 (morning) - Sourcing filter in the app; hero card shows the whole loop

**Job filter (ROADMAP Now #1, first half - shipped).** `lib/watchlist/targets.ts` (tested): a role is
kept if its location contains a target city and its title contains a target phrase as WHOLE words,
and no excluded phrase ("intern" never hits "internal"). Empty lists filter nothing. Used by
`refreshWatchlist` (the in-app button, which had no filter and could flood the table) AND
`scripts/source-singapore.ts` (its hardcoded regexes are gone; it refuses to run with no targets).
- Data: profile columns `target_titles`, `excluded_titles` (migration **0003, applied live**;
  mirrored in schema.sql). Parag's phrases are DATA in `data/cvbuilder/archetypes.json`:
  `titleKeywords` per role family + top-level `excludedTitleKeywords`; the importer unions them.
- Editable on `/app/watchlist` ("What you are looking for": cities / titles to keep / to drop).
- Live: set the two columns directly (NOT `db:seed`, which would reset app-edited applications),
  ran the real refresh (153 matches), and dismissed the 9 saved roles that no longer match
  (designers, an intern role, product-ops specialists). 161 open. Engineering-manager roles now
  appear because that is one of Parag's five role families - he can drop it on the watchlist page.

**Hero card** now plays the whole loop: sourcing, networking, applying, interview, then Improve (loop
arc lights, ring returns to start), round two, offer. Each frame is tagged AI / automatic / soon. On
wrap the ring re-mounts and fades in instead of sliding back (the old glitch). H1 is now "From the
first search to the final offer."; the lede says negotiation is coming.

Tooling note: in this Bash tool, `\\n` inside a heredoc arrives as `\n` - use the Edit tool (or a
separate file) for code containing escape sequences.

**Next:** rest of ROADMAP Now #1 - daily cron + retire closed roles (several roles marked `new` are
already gone from their boards).

## 2026-09-25 (overnight) - Landing page rebuilt around the job-search loop; roadmap written

**The product's shape, decided with Parag:** Sourcing -> Networking -> Applying -> Interview prep ->
Offer & negotiation, with **Improve** looping back to Sourcing after a rejection. Networking means
talking to people in the target office, even before a role is posted - Parag will build it. The salary
negotiation framework comes from Parag later.

- **Hero card fixed:** the track line, dots and moving ring were each placed with their own magic
  offsets (centres at 14 / 17.5 / 17px). Now one `--rail` variable centres all three. Dark mode: the
  card's sheen and edge light used `--surface` (near-black in dark), so they darkened the card - new
  token `--glass-light`.
- **Landing copy rewritten** around the whole search, with AI named where it does the work. Removed
  claims that were not true: cover letters, PDF/DOCX download, CV/LinkedIn upload, "checked daily".
- **Process map** (`app/_components/process-map.tsx`) at the foot of the landing page: six stages with
  arrows plus the Improve loop. Click a stage to open its steps; each step is tagged AI / Automatic /
  You, plus `coming` if not built. A stage shows a solid `AI` badge only when it has working AI, and
  `AI soon` when its only AI steps are still coming. On phones the steps open under the stage tapped.
- **docs/ROADMAP.md** (written by a subagent, spot-checked): status of every capability per stage,
  and a ranked Now/Next/Later. Its findings: the in-app watchlist Refresh has no city/role filter (only
  the script does), so it can flood; per-org cap and short-variant rules exist in `lib/editorial` but
  `tailorCv` never calls them (CLAUDE.md corrected); no UI to add contacts; `prepSet` still unwired.
- Headless-Chrome gotchas when screenshotting: a stale `--user-data-dir` renders blank; resizing the
  viewport to capture the full page can restart CSS animations, so panels look faded when they are not.
  Drive Chrome over its DevTools protocol (Node 24 has WebSocket built in).

**Next:** pick from ROADMAP "Now" - start with sourcing you can trust (filter into the in-app refresh,
retire closed roles, daily cron).

## 2026-09-24 (night) - Dark mode

Toggle (`app/_components/theme-toggle.tsx`) in the app nav and the landing nav cycles Auto / Light /
Dark, stored in `localStorage` (`jobsearch-theme`). Auto = the browser's local clock, dark 19:00-07:00;
never the OS scheme. `lib/theme.ts` (tested) holds the rule and the pre-paint boot script in
the root layout's `<head>`. Dark palette = `:root[data-theme="dark"]` in `globals.css`; new token
`--glass-edge`. Checked in headless Chrome (demo mode) on `/`, `/app` and `/app/interview`. DESIGN.md
§5 is updated.

**Next:** the choice is per browser, not per account. Save it to the profile if that matters.
Consider letting a user set their own switch hours.

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

## 2026-09-17 - Supabase project paused (operational note)

**Symptom:** sign-in on the live site dumps the browser on a Chrome DNS error at
`<ref>.supabase.co/auth/v1/authorize?...`. Looks like broken auth; is not.

**Diagnosis:** the project host returns NXDOMAIN, the pooler host still resolves (so it is not
local DNS), the auth settings endpoint that answered on 09-10 returns 000, and the pooler reports
`tenant/user postgres.<ref> not found`. That set of four is the signature of a **paused project**,
not a code or config fault - the server action had correctly built the OAuth URL with redirect_to
and a PKCE code_challenge before handing off.

**Cause:** Supabase pauses free-tier projects after ~7 days of inactivity and the API subdomain
stops resolving. Last activity 09-10 (schema apply + seed); this surfaced on 09-17, exactly 7 days.

**Fix:** Supabase dashboard -> Restore. Data survives a pause. Nothing in the repo changes.

**Worth knowing:** a job search runs in bursts, so this will recur. Options if it becomes annoying:
a scheduled query to keep the project warm, or accept it and restore on demand. Also note
`isSupabaseConfigured()` only checks that env vars exist, not that Supabase answers - so the app
offers a sign-in button that cannot work. A health check on /signin would catch it.

## 2026-09-10 - Session 7 (Cowork, cloud): landing polish + four designed features built + working shell

**Done** - 13 commits; **371 tests, 57 files, all green; tsc clean; production build passes** (fonts stubbed in the sandbox, see CLAUDE.md sandbox note).
- **Landing page** rebuilt for Wani's brief (lively, iPhone-like, liquid glass, still minimal): glass nav that lifts into a blurred pill on scroll, a glass hero card walking one application through the stage scale with a springing puck and pointer sheen, staggered spring reveals (JS-gated), an ambient blob for the glass to blur, three quiet-fact tiles. Reduced-motion safe, no shadows, nothing red. DESIGN.md §5 gained the "marketing-surface allowance"; `/app` keeps 120ms motion. Stage-scale tokens added to globals (light + dark).
- **Editorial layer** `lib/editorial/` (53 tests) - DESIGN §2's six mechanisms: composeSelection (pins with reasons, org caps as data, decisions log), fitToPage (short variant before a cut, pins never dropped), pageFit line model, collision + repeated-phrase audits, applicationGaps (cover letter input).
- **Watchlist** `lib/watchlist/` + repo + `refreshWatchlist` service (52 tests) - detectAts from a careers URL (Greenhouse/Lever/Ashby/SmartRecruiters, unknown = manual), keyless board mappers, cross-source identity + dedupe, exclude-already-in-pipeline, declared-target boost (45) that outranks title overlap, per-board failure isolation.
- **STAR stories + onboarding logic** `lib/stories/`, `lib/onboarding/` (80 tests) - Story schema, competency inference, story gap report, number consistency, prepSet scoped to the sent CV; skeleton merge rule with surfaced disagreements, provenance / needs-metric / strength-cap guards (ONBOARDING example pinned), readiness meter, proudest-three, nudge queue.
- **Real LLM providers** (67 tests) - Gemini, Groq, Anthropic behind LlmProvider with injected fetch; `createLlm(env)` routes small -> Gemini then Groq, premium -> Anthropic (opt-in, falls back); `withLedger` logs every call. Env: GEMINI_API_KEY/MODEL, GROQ_API_KEY/MODEL, ANTHROPIC_API_KEY/MODEL.
- **Freeze on send** - `snapshotCv` + `markApplied` service: the applied transition stamps appliedAt once and writes `application_cvs.sent_snapshot/sent_at` exactly once (override > variant > base; null for a bullet the bank lost). Second pass changes nothing; missing CV never blocks.
- **Schema** - watchlist + stories tables, ats_kind enum, application_cvs.pins/decisions/page_fit/sent_snapshot/sent_at, projects.depth/bullet_cap folded into schema.sql (parser-checked, 67 statements). `_pending/` removed. **Not yet applied to the live project.**
- **App layer** - `lib/db/getWorkspace()` (live via @supabase/ssr, demo = FakeDb from the corpus, tested), OAuth sign-in + `/auth/callback`, `/api/jd|cv-diff|brief` wired, and the `/app` shell: pipeline board, application detail (move, freeze, evidenced-vs-gap chips, CV recipe, tailor), bank (readiness, nudges, points), watchlist (add/pause/remove/check boards, sourced roles). Exercised end to end in the demo with Playwright: mark-applied froze the CV, watchlist add detected Greenhouse.

**Decisions**
- Demo mode shows the real corpus (it is already public in this repo) with a visible "demo workspace" badge; edits persist per server process only. Parag may prefer an anonymised sample - easy swap in `lib/db/demo.ts`.
- Open decisions resolved by assumption inside the new modules are listed in each module's header comments and in the agent reports summarised here: watchlist is global per user; ATS derived from URL; dedupe = canonical URL then company|title|location; sourced jobs stay a shortlist (never auto-create applications); STAR intake assumed yes (DESIGN §7 Q2); prep = per application + whole story bank; no question generation; readiness weights 15/10/15/20/40.
- `lib/editorial` checks variant text as evidence in `applicationGaps`; `buildDiff` still checks only base text/skills - align when tailoring adopts the editorial layer.

**Not done / next (in order)**
1. **Apply the new schema live** (`npm run db:apply` + `db:seed`) and set the Vercel env vars (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; GEMINI_API_KEY or GROQ_API_KEY for /api/jd). Enable Google + LinkedIn OIDC providers in Supabase Auth with redirect `<site>/auth/callback`.
2. Wire `tailorCv` through the editorial layer (composeSelection -> fitToPage, persist pins/decisions/page_fit) - today the service still uses selectBullets + buildDiff directly.
3. PDF/DOCX export of the resolved CV into a Supabase storage bucket (`application_cvs.file_path`). Cover letter still blocked on the format (DESIGN §7 Q1).
4. Stories UI (capture form + prep view per application) - domain and table exist, no page yet. Watchlist refresh on a GitHub Actions cron.
5. Onboarding screens 1-6 as UI over `lib/onboarding` (parsing uploads needs the vision/text LLM path).
6. Verify provider API assumptions before first live LLM call (model ids, Gemini free-tier model, Groq json_object).
7. `middleware.ts` for Supabase session refresh on navigation (server client refreshes on read today; fine for a start).

## 2026-09-09 - Session 6: onboarding design, rename to JobSearch, Vercel duplicate

**Done**
- **`docs/ONBOARDING.md`** - the first-run flow, design only, no implementation. Eight screens; two
  distinct questionnaires (a 60s structured *target* one up front, an adaptive *gap interview* in the
  middle); two synchronous doors (upload CV / LinkedIn profile PDF / screenshots, or talk it through)
  with a stated merge rule; three honesty guards at intake; a deferred-work nudge queue; four open
  decisions at the end.
- **`docs/DESIGN.md`** - one design doc for all four features (feature index, then a deep section
  each): onboarding (pointer to its own doc), JD -> cover letter + resume, STAR interview prep,
  company-targeted sourcing. Records seven decisions taken and eleven still open.
- **Landing page built** - the first real UI. `app/globals.css` (Heather tokens, light + dark),
  `app/layout.tsx` (Newsreader / IBM Plex Sans / IBM Plex Mono via `next/font`, self-hosted),
  `app/_components/logo.tsx` (Stages mark in `currentColor`), `app/page.tsx` (header, thesis, four
  numbered steps, honesty section), and `app/signin/page.tsx` so the CTA is not a 404 - onboarding
  screen 0 with both providers **disabled**, not silently inert, until Supabase auth lands. Steps are
  numbered because they are a real sequence, and are hairline rows rather than cards. Build and tsc
  clean; both pages prerender static at under 400 B of route JS.
- **Design system, chosen and written into `DESIGN.md` §5.** Palette **Heather** (muted periwinkle
  `#6F6A96` on `#FBFAFC`), logo **Stages** (four rising dots = the pipeline, in `currentColor`),
  Newsreader + IBM Plex Sans + IBM Plex Mono, no shadows, 3px radius. Governing principle: **rejection
  is not a user error, so it is never red** - `lost`/`withdrawn`/`ghosted` are the ordinary arithmetic
  of applying, and colouring them red makes the most common outcome the loudest thing on screen.
  Closed is neutral taupe whatever the reason; the accent deepens with pipeline progress; only stale
  (`#B5904F`, past 14 days) and follow-up-due earn colour. Three palettes and three marks were
  proposed visually at `https://claude.ai/code/artifact/c45039da-89d8-4ede-ac32-2eabbdb2442d`.
- **Renamed the product JobPilot -> JobSearch** (Parag's call: one name across repo, package and
  deploy). 24 occurrences, 12 files. Three deliberately NOT renamed - see below. seed.sql regenerated
  (`npm run seed:build`): only the two header comments and the raise-exception string moved, no data
  rows, so ids are unchanged and `db:seed` still upserts. 112 tests green, tsc clean.

**Decisions**
- **`stableId`'s `jobpilot:` prefix is frozen** (`lib/import/cvbuilder.ts`). Every id in the live DB
  hashes from that string; renaming it regenerates all of them and the next seed would insert
  duplicates instead of upserting. Comment added at the call site so it does not read as a stale
  rename and get "fixed".
- `CLAUDE.md`'s `parag/jobpilot` path stays - it is the external Cowork folder, not this product.
- `lib/repos/projects.test.ts` keeps "JobPilot" as fixture data (an arbitrary project name in a test).

**Vercel: two projects, diagnosed**
- `parag08's projects` (Hobby) holds **two** projects, `jobsearch` and `jobpilot`, both Git-connected
  to `Parag08/jobsearch` on `main`. Every push builds twice.
- **When and how:** GitHub's deployment records show zero Vercel deployments for the four pushes on
  Aug 29 and Sep 2, then two deployments 34s apart on the first push after - Sep 4 10:45 UTC. So
  Vercel was connected on Sep 4 and *both* projects were created in that one sitting; neither has a
  deployment the other lacks. Most likely cause: the GitHub import defaults the project name to the
  repo name (`jobsearch`), and the import was re-run to get the product name instead of renaming in
  Settings. Connecting Vercel was never logged here, which is why it went unnoticed for five days.
- **Resolved:** Parag deleted the `jobpilot` project; the stale `Production - jobpilot` GitHub
  environment was deleted over the API too (deleting a Vercel project leaves GitHub's environment and
  deployment history behind - it is bookkeeping, not evidence the project survived). Only
  `Production - jobsearch` remains. Confirm on the next push that exactly one deployment fires.
- **The Vercel MCP connector cannot see these projects.** `list_teams` returns the right account, but
  `list_projects` returns `[]` for it under both team id and slug, and `get_project` 404s on a project
  visible in the browser. Hobby projects live in the personal scope, which the Vercel API lists only
  when no team is given - and the tool requires `teamId`. Tool limitation, nothing wrong with the
  Vercel setup. A real `prj_` id may still work with `get_project` / `list_deployments`.

**Next**
1. Delete the `jobpilot` Vercel project, then set env vars on `jobsearch` using the **`.env.example`**
   names (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` all envs;
   `SUPABASE_SECRET_KEY` Production+Preview, never `NEXT_PUBLIC_`). Keep `SUPABASE_DB_URL` off Vercel
   - it is a GitHub Actions secret; nothing in the app needs DDL. Note `.env` still uses the
   un-prefixed names (flagged in session 3) - reconcile when the Supabase client is wired.
2. Wire the API routes to a real Supabase client (unchanged, still the biggest gap).
3. Bain evidence fix (unchanged, asked Parag; regenerates a curated base CV).
4. When CV tailoring gets built, `selectBullets` needs the per-org cap; ONBOARDING.md screen 3 surfaces
   the same rule as a user choice ("full story / one-liner / omit" per role).

## 2026-09-04 - Session 5: re-sync after the Bain applications

**Done**
- Re-synced `data/cvbuilder/` from the CVbuilder project (Parag worked in it 09-03/09-04), rebuilt `supabase/seed.sql`, applied it. Live DB now: **23 bullets, 5 applications, 5 application CVs, 3 sectors** (was 20/3/3/2). 112 tests green, tsc clean.
- What actually changed in the corpus: **3 new points** (`nutanix-move-diligence` s5 - the Move technical due diligence, 400+ critical security risks to 20 and 500+ licence risks to zero; `valeo-cost-buyin` s4 - CEO/ops-leadership approval; `nutanix-vp-roadmap` s4 - the six-month roadmap presented with the VP), **2 new applications** (Bain TIG + Bain general consulting), a reordered Eleven01 title, and a rewritten consulting-archetype note. Everything else was line-ending noise.

**The editorial learnings the CV work produced** (they live in CVbuilder's `notes` fields, not in its CLAUDE.md, which has not changed since 08-29):
- **Standing instruction: Valeo and EverHaus are capped at two points each** - an internship and a part-time role must not outweigh the full-time ones. This forced `valeo-cost-buyin` to carry an `overrideText` merging the 30% recommendation with the CEO approval on both Bain CVs.
- **Naming a tool is a factual claim.** add-tech now leads with "Claude" (not generic "AI") because Cursor was confirmed to be running Claude on the Valeo work - deliberately aimed at McKinsey, which deploys Claude. The Nutanix/EverHaus AI bullets were left alone: not confirmed as Claude, so naming it there would be invention.
- **ATS pass-through:** "Generative AI Tools (Claude, Cursor)" was added to the Skills line as well as Technologies, so a keyword scan of Skills alone still hits.
- **A gap closed:** the Skills line can now honestly claim Technology Due Diligence - before `nutanix-move-diligence` it could not, and deliberately did not.
- **Open gap:** no French, so Bain **Montreal** may be a hard filter. Worth checking before applying there.
- `nutanix-vp-roadmap` is in the pool but deliberately off both Bain pages (collides with `nutanix-sales-acv`).

**Two import bugs this surfaced, both fixed**
- `savedAt` fell back to the wall clock for applications CVbuilder never re-saved (only microsoft-*.json today), so `seed.sql` differed on every rebuild and the committed-seed guard failed a day later. Now falls back to `UNDATED_FALLBACK_DATE`; `ImportOptions.today` is optional and the script no longer passes the clock.
- `seed:build` re-derived the workspace owner from `profile.json`, which lists the INSEAD address first - but the auth.users row is the gmail one. A plain rebuild silently retargeted the seed at a non-existent account (it aborted cleanly). The existing seed's owner now outranks the profile.

**Known-wrong, left as data**
- `bain-tig-consultant` imports as role family **product-strategy**; it is a consulting role. The importer only trusts a family when an archetype claims the posting as evidence, and no archetype does - so it guessed and warned. Fix at source: add both Bain JDs (and BCG/Microsoft) as `fromApplication` evidence in CVbuilder's `data/archetypes.json`, rebuild the base CV, re-sync. That also lets the consulting archetype learn from two real MBB JDs instead of leaning on its seed.

**Next**
1. Wire the API routes to a real Supabase client (unchanged, still the biggest gap).
2. Bain evidence fix above (asked Parag; not done unilaterally - it regenerates a curated base CV).
3. When CV tailoring gets built here, `selectBullets` needs the per-org cap the CVbuilder work relies on; it currently has no notion of one.

## 2026-09-02 - Session 3: CVbuilder data import

**Done**
- Brought the real CV corpus into the repo: `data/cvbuilder/` (profile, points, taxonomy, archetypes + 10 application files), copied from the CVbuilder project. `data/settings.local.json` was deliberately NOT copied - it holds a live Google API key, and this repo is public on GitHub.
- Import layer, red->green: **112 tests, 25 files, all passing; tsc clean.**
  - `lib/import/cvbuilder.ts` - pure transform, zod-validated. CV role -> project; point -> bullet (variants + strength carried); archetype -> master CV per role family from its base-CV selection; master.json/generic.json -> the "general" family (v1/v2); real applications -> application + application_cv (the CV actually sent, as a diff from its master); JDs -> sector nodes per (role family, geography).
  - JD extracts are built lexically from `taxonomy.json` (the user's own vocabulary), no LLM - process-jd overwrites them when a real extractor runs.
  - `lib/import/seed-sql.ts` - renders the workspace as one transactional DO block that resolves the owner from auth.users by email and upserts every row.
  - `lib/import/real-data.test.ts` - integrity checks against the actual data, plus a guard that fails if `data/cvbuilder/` changed without rebuilding `supabase/seed.sql`.
- `scripts/import-cvbuilder.ts` (`npm run seed:build`, via vite-node) and `npm run db:seed`; `scripts/db-apply.mjs` now takes a file argument and also reads `.env`.

**Decisions**
- Ids are deterministic hashes of CVbuilder slugs (`stableId`), so re-importing updates rows instead of duplicating them, and master CVs can reference bullets before either exists in the DB.
- Schema additions (drop-and-recreate policy still in force): `profiles.contact_lines`, `profiles.cv_extras`, `bullets.variants`, `bullets.strength`. `CvDiff` gained optional `variants`/`overrides` so a per-application re-angling survives the round trip. `Bullet.variants/strength` are optional in the domain type - app-built bullets carry neither and the DB columns default.
- A bullet's `role_family` comes only from explicit editorial signal (an archetype that pins it, re-angles it, or is the sole base CV carrying it); everything else is "general". Role family is only a scoring boost, so neutral bullets are still matched everywhere.
- Imported applications land in `saved`, never `applied`: CVbuilder never recorded whether they were submitted, and the import will not invent it. Each carries a next_action saying so.
- A posting no archetype claims gets its family guessed from taxonomy overlap AND a warning (currently: the Microsoft PDM role).

**Supabase: LIVE**
- Project `nntoalvvozwrlcilbnop` (ap-southeast-1). `npm run db:apply` then `npm run db:seed` both ran clean - schema.sql's first real execution, and the DB now holds the imported workspace. Verified: 1 profile, 2 sectors, 10 projects, 20 bullets, 7 master CVs, 3 applications + 3 application CVs, no dangling bullet references. Seeding twice leaves the counts unchanged (the upserts are genuinely idempotent).
- **Connect over the session pooler**: `postgres.<ref>@aws-0-ap-southeast-1.pooler.supabase.com:5432`. The direct `db.<ref>.supabase.co` host is IPv6-only and fails with ENOTFOUND here. Port 6543 (transaction mode) cannot run DDL - use 5432.
- `.env` (gitignored) holds SUPABASE_URL / PUBLISHABLE_KEY / SECRET_KEY / JWKS_URL / DB_URL. Note the app-facing names lack the `NEXT_PUBLIC_` prefix that .env.example specifies - reconcile when the Supabase client is wired.
- The owner auth.users row (parag.m.rahangdale@gmail.com) was created by hand in the dashboard. Seeding a different owner: `SEED_EMAIL=... npm run seed:build`.

**Next**
1. Wire the API routes to a real Supabase client (now the biggest gap): add @supabase/supabase-js, `createDb()` returning it as DbClient, user_id from the session, replace the 503 shells.
2. Feed the Microsoft JD into archetypes.json as evidence so its role family stops being a guess.
3. UI: pipeline board over the 3 live applications, then the bullet bank.

## 2026-08-29 - Session 2: repository layer (TDD)

**Done**
- Verified handoff baseline: npm install, 44 tests green, tsc clean. (This machine had no Node at all - installed Node 22 LTS locally to `~/.local/node`; shells need `export PATH="$HOME/.local/node/bin:$PATH"`.)
- Repository layer, red->green: **77 tests, 19 files, all passing; tsc clean.**
  - `lib/repos/db.ts`: `DbClient` - a structural subset of the supabase-js query chain (`from().select().eq()...single()`, insert/upsert/update/delete). Repos are written against this interface only; the real SupabaseClient satisfies it structurally once connected. `RepoError` + `one/oneOrNull/many` unwrap helpers - raw `{data,error}` never leaks upward.
  - `lib/repos/rows.ts`: row types mirroring supabase/schema.sql + all snake<->camel mappers in one place; zod-parse on every read.
  - `lib/repos/fake-db.ts`: in-memory `FakeDb` test double (the FakeLlm pattern for the DB) - upsert onConflict with SQL null-distinct semantics, single/maybeSingle, generated ids, detached result copies. Tested in its own right (fake-db.test.ts).
  - Per-table repos: sectors, applications, projects+bullets, cvs (master + application), contacts+interactions, sourced-jobs, briefs, token-ledger, profiles. Every query filters by user_id explicitly (defense in depth on top of RLS).
- Service layer, red->green: **83 tests, 22 files, all passing; tsc clean.**
  - `lib/services/process-jd.ts`: extract once -> merge sector -> open 'saved' application (raw JD = DB-only audit copy).
  - `lib/services/tailor-cv.ts`: score bank vs stored extract -> buildDiff/applyDiff (honesty rule enforced by buildDiff) -> persist application_cv -> link cv_id. No LLM in this path.
  - `lib/services/daily-brief.ts`: due follow-ups + stale applications (staleness measured from appliedAt, per pipeline) + top-3 new sourced jobs; upserts one brief per (user, date).
- API route shells: app/api/{jd,cv-diff,brief}/route.ts return 503 with a pointer to the tested service each will call once Supabase is connected.

**Decisions**
- Inserts omit domain ids: slugs from findOrCreateNode and adapter-synthesized sourced-job ids are provisional; the DB uuid comes back on the returned object and is the identity from then on.
- jd_raw goes in at insertApplication as a separate audit-only argument and never re-enters the domain object; interactions raw_text likewise stays in the DB.
- listContacts returns contacts without interaction logs; getContact composes them (newest first) for buildMessageContext.
- No @supabase/supabase-js dependency yet - added only when Wani connects Supabase; then a thin `createDb()` that returns the real client typed as DbClient.

**Push: resolved**
- This machine now authenticates to GitHub over SSH as Parag08 (ed25519 key at ~/.ssh/id_ed25519, added to the Parag08 account; origin switched to git@github.com:Parag08/jobsearch.git). main is pushed and tracking origin/main.

**Next (in order)**
1. Wani: connect Supabase (run schema.sql, confirm clean) and Vercel.
2. Wire the API routes: add @supabase/supabase-js, a `createDb()` returning the client as DbClient, auth'd user_id from the Supabase session; replace the 503 shells with calls into lib/services/*.
3. Real LlmProvider impls: Gemini free tier first, Groq fallback, behind routeModel; wire token_ledger via logTokens (needs API keys).
4. UI: pipeline board, contacts, projects (port the Cowork dashboard artifact's layout).
5. Sourcing cron (Vercel cron or Supabase edge function) with Adzuna/Jooble adapters -> upsertSourcedJobs.

## 2026-08-29 - Session 1: scaffold + domain layer (TDD)

**Done**
- Scaffolded Next.js 15 + TypeScript strict + Vitest + zod; placeholder landing page.
- TDD red->green across the domain layer: **44 tests, 9 files, all passing; tsc clean.**
  - sector-graph (M1): findOrCreateNode / mergeJdExtract / topSkills / gapAnalysis
  - bullet-matcher + cv-diff (M3): lexical scoring, top-k selection, diff-from-master with the keyword honesty rule, applyDiff
  - pipeline (M5): transitions (closed terminal, reason required), appliedAt stamped once, stale >= 14 days, funnel stats + response rate
  - outreach (M4): follow-up cadence (hot 3d / warm 7d / cold 14d), due list, MessageContext builder (relevant projects, last interaction, first-touch flag, shared ground)
  - scoring (M7): 0-100 job score = sector company + title/skill overlap + network boost + geography
  - token-meter: ledger, totals by module, budget ok/warning(80%)/exceeded
  - adapters: LlmProvider interface + FakeLlm + routeModel (small vs premium); Adzuna result mapper with fixture test
- Database data model: supabase/schema.sql - single canonical file, full drop-and-recreate (per Wani: no incremental migrations until live data). 12 tables, enums, RLS on everything, closed-needs-reason check constraint.
- CLAUDE.md project memory written.

**Decisions**
- Data model = supabase/schema.sql, edited in place, re-run wholesale until live data. Then freeze + switch to migrations.
- Domain layer stays pure (no I/O) so it tests fast and survives any framework change.
- jd_raw kept in DB for audit but NEVER re-enters prompts; jd_extract is the working copy.

**Next (in order)**
1. Wani connects Supabase (run schema.sql, confirm it executes clean - it has not run against a real project yet) and Vercel.
2. Repository layer: thin typed Supabase client wrappers per table (test with a fake client).
3. API routes: POST /api/jd (extract via LlmProvider -> merge sector -> create application), POST /api/cv-diff, GET /api/brief.
4. Real LlmProvider impls: Gemini free tier first, Groq fallback, behind routeModel; wire token_ledger.
5. UI: pipeline board, contacts, projects (port the Cowork dashboard artifact's layout).
6. Sourcing cron (Vercel cron or Supabase edge function) with Adzuna/Jooble adapters.

**Open questions for Wani/Parag**
- Supabase project region (Singapore region makes sense).
- Auth: email magic-link only, or Google OAuth too?
- Where should CV exports live: Supabase storage bucket vs generated-on-demand?
