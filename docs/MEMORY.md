# Work log (newest first)

Keep this file updated at the end of every working session: what was done, decisions taken, what's next. CLAUDE.md holds the stable rules; this holds the moving state. Keep only the last two or three sessions here - move older entries to docs/MEMORY-archive.md so a fresh session stays cheap to start.

## 2026-11-20 (late night) - Full mock interview, role-plays, company-first Interview tab (branch feat/full-interview)

Parag: company practice felt generic; wanted one realistic adaptive interview per company (e.g. Cognition) with one debrief, and every question still practisable with a role-play. Mid-build: make the page simple and company-first, but keep general practice for days with no interview. Design and decisions: **docs/FULL-INTERVIEW.md** (code lists moves, model picks; MCP read-back + agent role-plays; interviewer model env).
- Built: plan/session/role-play domain + tests, migration **0017** (not yet applied - `db.yml` applies on push to main), repos, services, actions, `full-interview.tsx`, `role-play-panel.tsx`, page rebuilt around the "Preparing for" strip, MCP `set_role_play` + `rolePlay` on upsert + `fullInterviews` in practice read-back. Demo has a Kestrel AI round with two model answers.
- **Set on Vercel:** `INTERVIEW_FULL_MAX_TOPICS=8`, `INTERVIEW_FULL_TOPIC_FOLLOW_UPS=3`, `INTERVIEW_FULL_TOTAL_FOLLOW_UPS=12` (unset = full interview off) and optionally `AI_GATEWAY_INTERVIEWER_MODEL`.
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

