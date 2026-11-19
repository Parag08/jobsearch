# Front-end critique

Reviewed 2026-11-19 on the local dev server (demo workspace, sample data), every screen at desktop
width (1366px) and the pipeline and landing at phone width (375px). Dark mode was not checked.
The P0s and 1.3 were fixed on 2026-11-19 (marked in the tables); everything else is still open. Each item names the problem and what I would do instead; copy
changes are written as **Now** / **Change to**.

Priority: **P0** blocks use or breaks the product's promise · **P1** costs every visit · **P2** polish.

---

## 0 · The big picture

1. **The interface talks about how it is built, not what it does for you.** "Read once into
   structure", "never re-enters a prompt", "kept for audit", "live recipe", "public endpoints",
   "speaks MCP", "a declared target outranks anything an aggregator stumbles on", "Scored by rules,
   so it costs nothing to run". These are the token-economy and architecture rules from CLAUDE.md
   leaking into the UI. A job seeker wants to know what happens next, not that a prompt was avoided.
   Pass every sentence through one test: *would a classmate who has never seen the code need this?*
2. **One concept, five names.** Your experience is called the *record* (landing, sign-in), the
   *bank* (nav, chip legend), *evidence* (process map), the *master* ("Re-tailor from the master")
   and *points* / *bullets* (Bank header vs. readiness line). Pick one user-facing word and use it
   everywhere. I would use **Experience** for the page and **points** for the items in it.
3. **Internal identifiers are shown as labels.** Taxonomy slugs (`strategy-consulting`,
   `product-management`, `ops-execution`, `general`) appear as chips on the application, Bank and
   Insights pages; priority codes (`p30`, `p50`) on Bank; MCP tool names on Agent; "CVbuilder" on
   every pipeline card. Map every slug to a human label ("Strategy consulting") before it renders.
4. **The visual identity is the generic AI-generated look, almost exactly.** Warm oat canvas
   `#F4F1EA` (the precise value), a terracotta accent `#C96A3F`, a high-contrast serif display
   (Fraunces), IBM Plex Mono for small labels, uppercase mono eyebrows, "A · B · C" meta strings, "→"
   appended to links, and every section in an identical 16px-radius card with stat tiles on top.
   Each of these is reasonable alone; together they read as a template, which works against a
   product whose pitch is "nothing generic, nothing made up". See section 9.
5. **Plain hyphens are used as dashes.** " - " appears throughout ("structure - company, role",
   "Jul - Aug 2026"), mixed with real em dashes elsewhere. Use an en dash for ranges (Jul–Aug) and
   rewrite most of the rest into two sentences; the copy leans on dashes heavily.

---

## 1 · Global shell and nav

| # | P | Problem | Change |
|---|---|---|---|
| 1.1 | **P0** **fixed 2026-11-19** | On phones the app nav links are `display: none` (`app.module.css:105`) with nothing replacing them. Below 640px you cannot reach Bank, Watchlist, Insights, Interview or Agent at all. | Add a menu (a glass sheet fits the design rules), or a bottom tab bar for the five main pages. |
| 1.2 | **P0** **fixed 2026-11-19** | Landing nav overflows at 375px: "Sign in" wraps onto two lines and "Get started" is clipped off the right edge. | Hide "Sign in" and the theme toggle under 480px; keep one CTA. |
| 1.3 | **P1** **fixed 2026-11-19** | The landing hero is blank on first paint: every hero line is wrapped in `Reveal`, which hides content until JS hydrates and the observer fires. Screenshots taken 2–3s after load showed only the eyebrow. With slow JS the page looks broken. | Remove `Reveal` from the hero entirely (it is above the fold, there is nothing to reveal). Keep one entrance, if any, for the hero demo card. |
| 1.4 | P1 | Nav label **Agent** means nothing to most users. | **Connections**, or **AI assistant**. |
| 1.5 | P1 | Nav label **Bank** reads as finance. | **Experience** (see 0.2). |
| 1.6 | P2 | The "demo workspace" pill is monospace and truncates to "demo worksp…" on phones. | Sentence-case DM Sans, text **Sample data**; tooltip: "You're looking at sample data. Changes reset when the server restarts." |
| 1.7 | P2 | The theme toggle shows a clock icon in Auto mode; nobody will guess that a clock means "dark after 7pm". | Show sun/moon for the current state; put "Auto (dark 7pm–7am)" in the tooltip and accessible name. |

---

## 2 · Landing page

| # | P | Problem | Change |
|---|---|---|---|
| 2.1 | P1 | The headline could belong to any job tool. The product's actual difference, a CV that only claims what you can prove, is buried in section four. | Lead with it. **Now:** "From the first search to the final offer." **Change to:** "A CV that only says what you can prove." Subhead: "JobSearch finds roles at the companies you choose, builds each CV from your own experience, shows you the gaps honestly, and rehearses you for the interview." |
| 2.2 | P1 | "Your job search, end to end" appears three times: the eyebrow, the hero demo card's header and the footer. | Drop the eyebrow (it is also an uppercase mono label, see 0.4). Retitle the demo card **One search, start to offer**. Footer: just the logo and © line. |
| 2.3 | P1 | The lede is one 55-word sentence with a dash aside ("and, soon, helps you negotiate the offer") and a promise ("nothing is ever claimed") in the same breath. | Use the subhead in 2.1. Leave "soon" items to the Coming next list. |
| 2.4 | P1 | The hero demo card is small (about a third of the hero) and the animated story is hard to follow at 2.6s per frame with 10px labels. It's the most characteristic thing on the page and it is underplayed. | Make it the bold element: give it real size, and slow it to ~4s per frame or let the user step through it. |
| 2.5 | P1 | The three "quiet" stat tiles (1 / 0 / $0) are the big-number-small-label template, and they talk about design rules ("Red pixels for a rejection") and hosting cost ("$0 to run"), which aren't user benefits. "0 red pixels" also reads oddly out of context. | Cut the row. If you keep one idea, keep the rejection one, as a sentence: "Most applications close. That's arithmetic, not failure, and the app never treats it as one." |
| 2.6 | P1 | Step tags contradict the process map. Step 01 says sourcing works today ("Scored by rules"); the process map labels Sourcing **AI soon**. The hero demo tags it "automatic". | Align all three to one source of truth (process-map data). |
| 2.7 | P2 | Step tags are developer notes. **Now:** "Scored by rules, so it costs nothing to run" / "AI reads the posting" / "Your pipeline, always current". | Either drop the tag line or make it consistently "who does it": **Automatic** / **AI** / **You**, matching the process-map legend. |
| 2.8 | P2 | Step copy edits. **Now:** "Track it without the dread … nothing is ever coloured red." | **Change to:** "Track every application. See each one's stage and next step, and get a nudge when one goes quiet." (The "no red" point is made once, in 2.5, not three times.) |
| 2.9 | P2 | **Now:** "Paste a job, get it read". | **Change to:** "Paste a job posting". Body: "AI pulls out the company, role, level and skills, and opens an application for it." |
| 2.10 | P2 | The ctaNote uses an em dash and "no password to make". | "Free. Sign in with Google: no password, and your account is created on the first visit." |
| 2.11 | P2 | **Now:** "Open any stage to see what happens inside it - and which steps AI does for you." | "Open a stage to see what happens in it and which parts AI does." |

---

## 3 · Sign-in (`/signin`)

| # | P | Problem | Change |
|---|---|---|---|
| 3.1 | **P0** **fixed 2026-11-19** | "Next we help you build your record — bring a CV, a LinkedIn PDF, or just talk it through." There is no onboarding screen yet (`lib/onboarding` has logic, no route), so a new user is promised a step that never comes. | Remove the line until onboarding ships, or say what actually happens: "You'll land on your pipeline. Start by pasting a job posting." |
| 3.2 | P2 | "Continuing with Google creates your account if you do not have one yet, and signs you in if you do." | "New here or coming back, it's the same button." |
| 3.3 | P2 | "Back" | "Back to home". |

---

## 4 · Pipeline (`/app`)

| # | P | Problem | Change |
|---|---|---|---|
| 4.1 | **P0** **fixed 2026-11-19** | The default view is filtered to "active in the last 7 days", so with 5 applications the board shows **nothing**: "0 of 5 applications: active in the last 7 days. Show all" and then "Nothing in: saved · applied · … · closed". The home screen of the app is an empty state while the stats above say 5 are open. | Default to all open applications. If recency matters, sort by it and dim older cards instead of hiding them. |
| 4.2 | P1 | "0% response rate" when nothing has been applied for is false precision. | Show "–" and the caption "after your first application". |
| 4.3 | P1 | Five equal stat tiles take the first row (the SaaS card kit). "ever applied" is awkward; "stale past 14 days" is jargon. | Replace with one sentence line: "5 open · 0 applied · 0 waiting over 2 weeks · 0 follow-ups due", each number a link that filters the board. |
| 4.4 | P1 | The paste-a-JD form dominates every visit, and says the same thing twice (body and placeholder) in system terms. **Now:** "It is read once into structure - company, role, seniority, skills - and opens a saved application. The raw posting is kept for audit and never re-enters a prompt." Placeholder: "…It is parsed once and stored as structure - the raw text never goes into another prompt." | Make it an **Add a job** button in the page header that opens a sheet. In the sheet: heading "Add a job", placeholder "Paste the full job posting", helper "We'll pull out the company, role and skills and save it to your pipeline.", button **Add to pipeline**. |
| 4.5 | P1 | The board is not a board: only non-empty stages render, stacked full-width, and the empty ones become a mono "Nothing in:" line. You can't see where things are in the funnel at a glance. | Real columns for the active stages (saved → offer) with counts, horizontally scrollable on mobile; closed collapsed to a count at the end. |
| 4.6 | P1 | Every card shows the same truncated next step: "Imported from CVbuilder - confirm whether this was submitted, then advance the stage". "CVbuilder" is an internal tool name and the text is cut off on every card. | Card shows company, role and one short action: **"Sent it? Mark as applied"**. Store the import note elsewhere. |
| 4.7 | P2 | Card titles truncate ("BCG (Boston Consult…") and data casing leaks ("Tiktok"). | Allow two lines for company; normalise display names at import (BCG, TikTok). |
| 4.8 | P2 | The mono date top right (2026-11-19) does nothing. | Remove it. |
| 4.9 | P2 | Stage header "SAVED" is uppercase mono on a tinted strip. | Sentence case "Saved", normal UI face, count beside it. |

---

## 5 · Application detail (`/app/applications/[id]`)

The densest screen and the one with the most copy to fix.

| # | P | Problem | Change |
|---|---|---|---|
| 5.1 | **P0** **fixed 2026-11-19** | **The honesty promise is visibly broken on the sample data.** The cover-letter box lists "mba" as an honest gap the CV cannot claim, while the CV headline directly above says "INSEAD MBA Class of December 2026". Either the matcher misses the education section or the headline is exempt from the rule; either way, the one thing the product promises is contradicted on screen. | Count profile/education as evidence in the matcher, and add a test for it. |
| 5.2 | P1 | Stage controls are a heading **Move** and a row of lowercase buttons: "mark applied (freezes the CV)", "→ screening", "→ interview", …, "close (withdrawn)". It doesn't show the current stage and "freezes" is jargon. | A stepper showing every stage with the current one filled (use the stage colour scale). Primary button **Mark as applied**, helper under it: "We'll keep a copy of the CV and letter exactly as you sent them." Other stages are clicks on the stepper. **Close application…** opens a reason picker (withdrew, rejected, no reply). |
| 5.3 | P1 | Next-action field is an unlabeled input with a button **set**. | Label "Next step", button **Save**. |
| 5.4 | P1 | **Now:** "What the JD asks for". The summary under it is the posting's eligibility paragraph pasted in. | "What they're looking for". Show seniority, location and the requirement chips; move eligibility to a small "Who can apply" line. Avoid "JD" anywhere in the UI; say "job posting". |
| 5.5 | P1 | Chip legend: "Solid chips are backed by your bank; dashed ones are honest gaps — they belong in the cover letter, not on the CV." The solid/dashed difference is hard to see, and the chips are slugs. | Two labelled groups instead of a legend: **You can show this** (strategy, research…) and **Not on your record yet** (MBA…), with "Address these in your cover letter" under the second. |
| 5.6 | P1 | The CV column shows unexplained numbers (4.5, 3.0, —) beside each line. | Either label them ("match 4.5") with a tooltip, or drop them and order by relevance. A dash next to most lines reads as "missing". |
| 5.7 | P1 | **Now:** "Re-tailor from the master" / "Live recipe — bank edits flow through until you mark this applied." | **Rebuild CV** / "This CV updates when you edit your experience. It's locked once you mark it applied." |
| 5.8 | P1 | Cover letter: "Draft the letter" is both a disclosure label (followed by a stray "-") and the button. The prompt is set larger than the card's own heading. Inputs rely on placeholders that truncate: "Named person, if know", "BCG (Boston Consultin". | Labels above fields: **"What caught your eye about BCG?"** (helper: "Something specific you found, not from their careers page. The letter uses only this, so it won't invent facts."), **Addressed to (optional)**, **Company name as it should appear**. One button: **Write cover letter**. |
| 5.9 | P1 | **Now:** "Three paragraphs: your career spine, why this firm, where you would be useful. The CV states only what your bank evidences; the letter is where the honest gaps (strategy, consulting, mba) get addressed." | "Three short paragraphs: your path so far, why this firm, and where you'd help. It's also where to address what your CV can't show: strategy, consulting." |
| 5.10 | P1 | **Now:** "The JD names no behavioural competency we recognise. Practise the general set in the question bank." | "This posting doesn't point to specific interview themes. Practise the general questions." with one link. Remove the duplicate "question bank →" in the header. |
| 5.11 | P2 | **Now:** "Each line on the CV · 16 without a story" | "Stories behind your CV: 16 still to write". |
| 5.12 | P2 | The CV header repeats the target: "…targeting Consultant, Singapore (Post-MBA) at BCG (Boston Consulting Group)." right under a page title that says the same. | Show the summary line as it will print; don't restate the target. |
| 5.13 | P2 | Breadcrumb "Pipeline · saved" in mono, and the saved date top right in mono. | "← Pipeline" as a link; stage shown in the stepper (5.2); date as "Saved 7 Sep". |

---

## 6 · Bank (`/app/bank`)

| # | P | Problem | Change |
|---|---|---|---|
| 6.1 | P1 | **Readiness: "100% — to improve: recent role 4 needs 2 more points".** 100% and "to improve" contradict each other, and "role 4" is an index, not a name. | "Ready to use. To make it stronger, add 2 points to Valeo Health." Show the bar only below 100%. |
| 6.2 | P1 | **Nudges** show priority codes (`p30`, `p40`, `p50`) and terse labels ("missing languages", "thin role ·", "needs metric ·") with bullets cut mid-word. | Rename **Suggestions**. Each one a full sentence and a link to the item: "Add the languages you speak", "Add another point to your INSEAD MBA", "Add a number to 'Secured CEO and operations-leadership approval…'". Drop the codes; order already shows priority. |
| 6.3 | P1 | Each bullet carries 6–7 slug chips, sometimes duplicated ("product-management product-management") and including "general". This is the noisiest screen in the app. | Show at most three human-labelled skills per point, dedupe, hide "general". Put the rest behind "+4". |
| 6.4 | P1 | Strength dots (●●●●●) have no label or legend. | Tooltip and accessible label: "Strength 5 of 5", or replace with words (Strong / Needs a number). |
| 6.5 | P2 | "3 variants" is styled like a skill chip but is a different kind of thing. | Text link: "3 versions". |
| 6.6 | P2 | Header meta "10 roles · 34 bullets" vs. "points" in readiness. | "10 roles, 34 points". |
| 6.7 | P2 | There's no way to add or edit a point from this page (from what's visible). If that's intentional, say where editing happens. | Add **Add a point** per role, or a line: "Edit your experience in …". |

---

## 7 · Watchlist (`/app/watchlist`)

| # | P | Problem | Change |
|---|---|---|---|
| 7.1 | P1 | Order is backwards: the filter form comes first, the companies second. A new user has to configure filters for companies they haven't added. | Companies first, filters second (collapsed once set). |
| 7.2 | P1 | **Check boards now** sits top right in a pale fill that looks disabled, before anything is set up. | Show it only when at least one company is watched; full-strength primary style. Text: **Check for new roles**. |
| 7.3 | P1 | **Now:** "Checking boards keeps only roles in these cities whose title contains one of your phrases, as whole words - and none of the excluded ones. Leave a box empty and it filters nothing. One per line, or separated by commas." | Heading "What to look for". Helper: "We'll only show roles in these cities whose title matches a phrase on the left and none on the right. One per line." |
| 7.4 | P1 | **Now:** "Paste a careers page URL. Greenhouse, Lever, Ashby and SmartRecruiters boards are read directly from their public endpoints; anything else is kept for you to check by hand." | "Paste a company's careers page. We check Greenhouse, Lever, Ashby and SmartRecruiters pages every day; for any other site we'll remind you to check it yourself." |
| 7.5 | P1 | **Now:** "No targets yet. A declared target outranks anything an aggregator stumbles on." | "No companies yet. Add one above and we'll check its job board every day." |
| 7.6 | P2 | "Titles to keep" / "Titles to drop" | "Job titles to include" / "Job titles to skip". Button **Watch** → **Add company**. |

---

## 8 · Insights, Interview, Agent

### Insights (`/app/insights`)

| # | P | Problem | Change |
|---|---|---|---|
| 8.1 | P1 | "2 roles read" while the pipeline has 5. Unexplained. | "Based on 2 of your 5 roles (3 haven't been read yet)" with a button to read them. |
| 8.2 | P1 | Gaps and Unstated, both empty, take the whole first screen as two cards saying "None.", pushing the only content (Backed by your CV) below the fold. | When empty, collapse to one line: "No gaps across these 2 roles." |
| 8.3 | P1 | "Unstated" is jargon. "requirements evidenced" too. | **Done, but not on your CV** ("Your history mentions these but no CV point says so."). Stat: "covered by your CV". |
| 8.4 | P2 | Filter chips are slugs; the search placeholder truncates ("or title words, e.g. forw"). | Human labels; placeholder "Filter by title". |
| 8.5 | P2 | "Gap plan: No plan drafted for this selection yet." with no visible action. | Button **Make a plan for these gaps**. |
| 8.6 | P2 | Title "Role insights" vs nav "Insights". | Match the nav, or rename both "What roles ask for". |

### Interview (`/app/interview`), the strongest screen

The forest-green stage, the single animated agent and the quiet list really work. Keep it as the
model for the rest of the app. A few fixes:

| # | P | Problem | Change |
|---|---|---|---|
| 8.7 | P1 | The general question bank is consulting- and MBA-specific ("Why consulting?", "What did you learn during your MBA that will make you a better consultant?"), while your stated target is AI/PM roles and the app is meant to work for anyone. | Make "Why consulting?" a template driven by the target line of work, or move consulting-only questions to a "Consulting" group. |
| 8.8 | P1 | "No model answer yet. Write your notes below and choose 'Rewrite as model answer'…" points at a button hidden inside the collapsed **Your notes**. | Open Notes by default when there's no model answer, or link the sentence to it. |
| 8.9 | P2 | The line under **Join interview** changed between loads: "Type or talk, then send. I'll follow up." / "Answer out loud. Pause, and I'll follow up." | Pick one: "Answer out loud or type. Pause when you're done and I'll follow up." |
| 8.10 | P2 | Tab **Casing**. | **Cases**. Casing intro: "Candidate-led cases, Bain style: you lead, ask for the data you need, and the interviewer gives it only when asked." |

### Agent (`/app/agent`)

| # | P | Problem | Change |
|---|---|---|---|
| 8.11 | P1 | **Now:** "This workspace speaks MCP. An agent holding one of your tokens can…" | Title **Connect an AI assistant**. "Let Claude or another assistant update your pipeline while you work: add applications, move stages, log conversations. It only sees your data, and you can disconnect it any time." |
| 8.12 | P1 | The raw tool list (`pipeline_summary, list_applications, upsert_application…`) is shown as body text. | Plain list of what it can do (Read your pipeline · Add and update applications · Log contacts · Prepare interview questions), raw names behind "Technical details". |
| 8.13 | P2 | The setup command has no copy button, and "0 active" sits top right in mono. | Add **Copy**; replace "0 active" with "No assistants connected". |

---

## 9 · Visual direction

What to keep, because it is genuinely specific to this product:

- **Closed states are neutral, never red.** A real point of view for a job search. Keep it; just
  stop *announcing* it on the landing page (2.5, 2.8).
- **The stage colour scale** deepening as an application advances, turning warm at offer.
  It's currently almost invisible because the board has no columns (4.5). Use it on the board
  and the stepper (5.2) and it becomes the app's signature.
- **Radius encodes elevation** and the glass-only-for-floating rule.
- **The interview room.** The deep forest stage is the best-looking thing in the app.

What I would change:

1. **Retire the oat + terracotta + Fraunces + Plex Mono combination.** It's the most common
   AI-generated palette almost to the hex. A direction that comes from this product: take the
   interview room's deep forest as the brand's *structural* colour (nav, page titles, the
   board's column headers), move the working canvas to a cooler, clearer paper so sage actions
   and the stage scale read crisply, and give "progress" a colour that isn't terracotta (a clear
   marigold, say, kept as fenced as terracotta is today). This deserves its own palette study
   rather than a swap from this list.
2. **Drop the monospace face for UI labels.** Eyebrows, dates, stage headers, the demo pill,
   breadcrumbs, chips: all are mono, and many are uppercase. Use the body face at a smaller size
   in sentence case, with `tabular-nums` where digits stack. Keep mono only for the setup command
   on Agent.
3. **Stop putting every section in a card.** Pipeline, Application, Watchlist, Insights and Bank
   are a stack of identical rounded cards with stat tiles on top. Let page sections sit on the
   canvas separated by space and a hairline; keep cards for things that are objects
   (an application, a case, a point).
4. **Cut the "→" from link text** ("question bank →") and the "A · B · C" meta strings; write them
   as short sentences or separate them with layout.
5. **Spend boldness in one place per surface.** Landing: the hero demo (2.4). App: the pipeline
   board with the stage scale. Interview: the stage (already right). Everything else quieter.

---

## Suggested order

1. P0s: mobile nav (1.1), landing nav overflow (1.2), pipeline default filter (4.1), MBA
   honesty contradiction (5.1), onboarding promise on sign-in (3.1).
2. The vocabulary pass: one name for experience (0.2), slug-to-label mapping (0.3), and the copy
   rewrites in sections 4–8. Mostly string changes; high return.
3. Pipeline as a real board + stage stepper (4.5, 5.2).
4. The visual direction study (section 9), done once across the design tokens.

---

## 10 · Second pass: nav order, Watchlist, Insights (2026-11-19)

Parag asked for Watchlist and Insights to get the treatment the Bank got, and for the tab order
to follow the day: overview, then pipeline, then interview. Every item below was seen on the
running app or read in the code; it supersedes 7.x and 8.1–8.6 above, which it folds in.
**All fixed 2026-11-19** on `feat/watchlist-insights-refine`; DESIGN.md section 5 records the result.

### Nav and landing

| # | Problem | Change |
|---|---|---|
| N1 | Tab order follows build history (Pipeline, Bank, Watchlist, Insights, Interview, Agent), not how the product is used. | **Overview, Pipeline, Interview**, then the tools that feed them: **Watchlist** (find roles), **Insights** (what they ask), **Bank** (your evidence), **Agent** (setup) last. |
| N2 | The overview is reachable only by clicking the JobSearch name, which nobody discovers. | An **Overview** tab, first. The name still opens it. |
| N3 | Sign-in and the signed-in redirect land on Pipeline. | Land on the overview (`/app/home`), the page that says what to do next. |

### Watchlist (`/app/watchlist`)

| # | Problem | Change |
|---|---|---|
| W1 | Backwards order: filters first, companies second, the payoff (roles found) last, below the fold. | Roles found first, then companies, then filters. With no companies yet, companies come first as the invitation. |
| W2 | **Check boards now** is a pale, disabled primary before anything is watched. (7.2) | Show it only when a company is active; full strength; **Check for new roles**. |
| W3 | Dense, technical copy: "as whole words - and none of the excluded ones", "public endpoints", "A declared target outranks anything an aggregator stumbles on". (7.3–7.6) | Plain sentences; **Job titles to include / to skip**; **Add company**. |
| W4 | Filter boxes are uneven (Cities short, the titles tall) and Save floats under them; the panel stays open forever though it is set once. | Three equal boxes; filters in a collapsible panel that starts closed once set, with a one-line summary ("Singapore · 2 titles · 2 skipped"). |
| W5 | Empty states are dashed boxes inside panels, half the panel wide: a box in a box. | One quiet sentence in the panel, full width. |
| W6 | Company rows: ATS as a lowercase slug chip ("greenhouse", "unknown") in green or dashed tones that mean nothing here; URL in monospace; lowercase **pause** / **remove**; a paused company looks the same as an active one; no monogram. | Monogram + name; "Checked daily (Greenhouse)" or "Check by hand" in orange; URL as a soft link; **Pause / Resume / Remove** as text buttons; paused rows dimmed with a Paused tag. |
| W7 | Roles found is a six-column table: scrolls sideways on phones; **Fit** shows "—" until a check has scored the role; **Source** in monospace; lowercase **shortlist** / **dismiss**. | Card rows: title (opens the posting), monogram + company, location, posted date, source; Fit as a tag only when scored; **Shortlist / Dismiss**; 20 shown, then Show all. |
| W8 | Shortlisting changes nothing visible except that the button disappears. | Shortlisted roles get a tag and sort first. |
| W9 | The company directory is queried on every load and thrown away; the actions to watch a listed company, or every readable one, exist but no UI calls them (wired in `301bad4`, never rendered). | **Suggested companies**: the readable ones you don't watch yet, each with **Watch**, plus **Watch all N**. Hidden when there are none. |
| W10 | Monospace for non-code text (DESIGN.md principle 6). | Sans everywhere. |

### Insights (`/app/insights`)

| # | Problem | Change |
|---|---|---|
| I1 | Title "Role insights" doesn't match the tab "Insights"; the subtitle floats outside the header. (8.6) | "Insights", subtitle under it in the header. |
| I2 | Role-family picker is tiny chips with raw slugs and bracketed counts ("product-management (2)"); the selected one turns green, the colour of "covered". (8.4) | A row of pill links in sentence case with a count; selected is the blue accent. |
| I3 | Title filter crammed beside the chips; placeholder truncates ("or title words, e.g. forwa"). (8.4) | Its own search field, **Filter by title**, with Clear. |
| I4 | Four stats float on the page background with lowercase jargon labels ("requirements evidenced", "unstated"); "2 roles read" with no "of how many". (8.1, 8.3) | A summary panel like the Bank's: "Based on 2 of 5 roles", a coverage bar, and the three counts in the Overview's words. |
| I5 | Empty groups take whole panels that say "None." in a dashed box. (8.2) | Hide empty groups; when there are no gaps, the summary says so. |
| I6 | Vocabulary differs from the Overview's Insights tab ("Gaps / Unstated / Backed by your CV" vs "Not on record / Done, not on your CV / On your CV"). | Use the Overview's words everywhere, with the same colours: orange, teal, green. |
| I7 | Requirement rows: term as a raw slug; "asked by 2 of 2 roles (100%)" and the wordings in monospace; nothing shows how common it is at a glance. | Sentence-case term, a small share bar, "Asked by 2 of 2 roles", wordings in soft text. |
| I8 | The details are dead text: "Mentioned in: Role, Org", "2 backing bullets". The fix lives in the Bank, which now has anchors and **Add a point**. | "Mentioned in Valeo Health: add it as a point" linking to that role in the Bank; "Backed by 2 points" linking to the first. |
| I9 | "On your CV" is a long, fully open list at the same weight as the gaps. | Collapsed by default. |
| I10 | Developer messages shown to users in monospace: "Set ROLE_READ_BATCH to enable.", "Set ROLE_PLAN_MAX_GAPS to enable plan drafting."; the plan's date line in monospace; plan prose runs the full width. (8.5) | Plain sentences ("Reading roles isn't switched on for this workspace"); date in soft text; plan at the 68ch measure; **Make a plan for these gaps** as the page's one primary, beside the gaps. |
| I11 | The unread-roles notice and the "Read 3 roles." result are loose grey lines between the header and the picker. | One notice row inside the summary panel, with **Read them** beside it. |
