# Work log (newest first)

Keep this file updated at the end of every working session: what was done, decisions taken, what's next. CLAUDE.md holds the stable rules; this holds the moving state. Keep only the last two or three sessions here - move older entries to docs/MEMORY-archive.md so a fresh session stays cheap to start.

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

