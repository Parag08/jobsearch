# Work log (newest first)

Keep this file updated at the end of every working session: what was done, decisions taken, what's next. CLAUDE.md holds the stable rules; this holds the moving state. Keep only the last two or three sessions here - move older entries to docs/MEMORY-archive.md so a fresh session stays cheap to start.

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
