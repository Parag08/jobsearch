# JobSearch - roadmap

What to build next, and why. Written for Parag and for any Claude session deciding the next task.

**How to use it.** Read it at the start of a planning session and pick from **Now**. When something
ships, move its row in *Status by stage* to Shipped, strike it from Now/Next/Later, and put the date
in the log at the bottom. Re-rank Now/Next whenever the job search changes (a new target, an interview
loop starting, an offer). The landing page's process map (`app/_components/process-map.tsx`, `STAGES`)
is the public promise: every step marked `coming` there appears below, and a step loses `coming` only
when it is Shipped here.

Status words: **Shipped** = a user can reach it in the app. **Built, not wired** = tested domain code
in `lib/` that no page, route or job calls. **Script only** = runs from `npm run`, not from the app.
**Not started** = nothing in code. AI column: AI = model call; Rules = code, no tokens; You = the user.

Last reviewed: 2026-09-24.

## The loop

```
  Sourcing -> Networking -> Applying -> Interview prep -> Offer & negotiation
     ^                                        |
     +------- Improve <---- not this time ----+
```

One record (bullet bank, stories, applications) feeds every stage; Improve writes back into it.

## Status by stage

### 1. Sourcing

| Capability | Status | AI | Where |
|---|---|---|---|
| Company catalogue + which ATS each runs | Shipped (sync is a script) | Rules | `lib/companies`, `lib/watchlist/ats.ts`, `npm run companies:sync`, `/app/watchlist` |
| Watch / unwatch companies | Shipped | You | `/app/watchlist`, `actions.ts` `addWatchlist`, `watchCompany` |
| Pull every open role from company boards | Shipped (manual button) | Rules | `lib/services/refresh-watchlist.ts`, `lib/watchlist/{fetcher,mappers,identity}.ts` |
| Filter to city + line of work | **Script only** | Rules | `scripts/source-singapore.ts` (`WANTED`/`NOT_WANTED` regex, hardcoded to Parag) |
| Fit score (sector, skills, network, location, target boost) | Shipped | Rules | `lib/scoring.ts`, `lib/watchlist/scoring.ts` |
| Scheduled refresh | Not started | Rules | DESIGN §4 "Scheduling" picks GitHub Actions cron; only `keepalive.yml` exists |
| Retire roles that close | Not started | Rules | - |
| "Why this role fits you" (two lines) | Not started | AI | - |
| Broad aggregator feed (Adzuna) | Built, not wired | Rules | `lib/adapters/adzuna.ts` |

Caution: the in-app **Refresh** button calls `refreshWatchlist`, which has no geography or role
filter - the script's own header says watching Databricks alone inserts 883 postings. The filter
that makes the list readable lives only in the script. The script's title filter also lets
"Senior Product Designer" through.

### 2. Networking

| Capability | Status | AI | Where |
|---|---|---|---|
| Contacts + interactions tables | Shipped (schema only) | - | `supabase/schema.sql` `contacts`, `interactions`; `lib/repos/contacts.ts` |
| Follow-ups due count on the pipeline | Shipped, but no way to add a contact | Rules | `lib/outreach.ts` `followupsDue`, `app/app/page.tsx` |
| Find alumni/contacts at a watched firm | Not started | Rules | - (no data source chosen) |
| Draft the first message | Built, not wired | AI | `lib/outreach.ts` `buildMessageContext`; `draft-outreach` tier in `lib/adapters/llm.ts` but no provider method |
| Log conversations, next follow-up date | Built, not wired | Rules | `lib/outreach.ts` `nextFollowupDate` |
| Contacts page / CRM UI | Not started | - | - |

### 3. Applying

| Capability | Status | AI | Where |
|---|---|---|---|
| Paste JD -> structured extract (stored once) | Shipped | AI (small) | `app/app/jd-form.tsx`, `lib/services/process-jd.ts`; also `/api/jd` |
| Sector graph learns from each JD | Shipped (invisible) | Rules | `lib/sector-graph.ts` via `process-jd` |
| Evidence vs gap chips per JD skill | Shipped | Rules | `lib/editorial/gaps.ts` on `/app/applications/[id]` |
| Tailor CV as a diff from the master | Shipped | Rules | `lib/services/tailor-cv.ts`, `lib/cv-diff.ts`, `lib/bullet-matcher.ts` |
| Per-org cap, short-variant-before-cut, page fit, collision audits | **Built, not wired** | Rules | `lib/editorial/{select,fit,page-fit,audits}.ts` - `tailorCv` does not call them |
| Mark applied -> freeze the sent CV | Shipped | You | `lib/services/mark-applied.ts`, `lib/freeze.ts` |
| Stale (14 days) and follow-up flags | Shipped | Rules | `lib/pipeline.ts`, `app/app/page.tsx` |
| Cover letter from the honest gaps | Not started | AI | design only: DESIGN §2 "The cover letter" |
| DOCX / PDF export | Not started | Rules | DESIGN §2 "Export - decided"; `application_cvs.file_path` never written |
| CV / LinkedIn upload at onboarding | Built, not wired (merge only) | AI | `lib/onboarding/skeleton.ts` `mergeSkeletons`, `intake-guard.ts` |
| Bank readiness + nudges | Shipped | Rules | `lib/onboarding/{readiness,nudges}.ts` on `/app/bank` |

### 4. Interview prep

| Capability | Status | AI | Where |
|---|---|---|---|
| Behavioural bank (26 MBB questions, firm notes) | Shipped | You | `data/interview/questions.json`, `/app/interview` |
| Written answer, blank or STAR, both kept | Shipped | You | `answer-editor.tsx`, `interview_answers` |
| Spoken practice (TTS question, live transcript) | Shipped | Rules | `practice-panel.tsx`, `speech.ts` (browser APIs) |
| Delivery scoring (measured + model judgement) | Shipped | AI (premium) | `lib/interview/score.ts`, `scoreAnswerAction` |
| Live case interviewer (10 tech M&A / PE cases) | Shipped; production needs `AI_GATEWAY_API_KEY` on Vercel | AI | `lib/interview/case-*.ts`, `case-room.tsx`, `data/interview/cases.json` |
| Technical tab (claims surface from the CV) | Shipped | Rules | `lib/interview/technical.ts` |
| Prep for this exact application | **Built, not wired** | Rules today | `lib/stories/prep.ts` `prepSet`, `gap-report.ts`, `competencies.ts` |
| Answers checked against CV bullet numbers | Built, not wired | Rules | `lib/stories/consistency.ts` - answers carry no bullet link |

### 5. Improve

| Capability | Status | AI | Where |
|---|---|---|---|
| Close an application with a reason | Shipped | You | `moveStage` + `ClosedReason` (won/lost/withdrawn/ghosted) |
| Record the stage it reached + notes | Not started | You | DESIGN §7 Q7: no interview-notes table |
| Pattern across outcomes | Not started | AI | - |
| Improvement pointers (CV, stories, case) | Not started | AI | - |
| Drill the weakest dimension | Not started | Rules | data exists: `interview_attempts` scores, `case_sessions` |

### 6. Offer & negotiation

| Capability | Status | AI | Where |
|---|---|---|---|
| Target package captured at onboarding | Not started | You | - |
| Compare offer against target | Not started | You | - |
| Negotiation framework | Not started - Parag to supply | You | - |
| Rehearse the call with an AI counterpart | Not started | AI | could reuse the case-room turn loop |

### Cross-cutting

| Capability | Status | Where |
|---|---|---|
| Morning brief | Built, not wired (API only) | `lib/services/daily-brief.ts`, `/api/brief`; no page, no schedule |
| Token ledger + budget | Logging shipped; budget view built, not wired | `withLedger`, `lib/token-meter.ts` |
| Theme saved per account | Not started (per browser today) | `lib/theme.ts` |

## Now

Ranked for a search that is live today. Each is a session or two.

1. **Make sourcing trustworthy and automatic** (M). Move the role/geography filter out of the script
   into `refreshWatchlist` as profile data (target titles, exclusions, cities - rule 4, no regex
   constants), tighten it (designers out), retire postings absent from a board on two refreshes, and
   run it daily from a GitHub Actions cron. *Why now:* the in-app Refresh button floods the table
   today, and a list that goes stale or fills with dead roles stops being read. Deps: none.
2. **Application-scoped prep on the application page** (S). Render `prepSet` - the likely
   competencies, the story or bullet for each, and the gaps - on `/app/applications/[id]`, with a
   link into the question bank. *Why now:* every interview invitation needs it, the code is done
   and tested, and it is the loop's first join between Applying and Interview. Deps: none.
3. **A CV you can actually send** (M). Wire the editorial layer into `tailorCv` (per-org cap: Valeo and
   EverHaus at most two; short variant before a cut; page fit; collision audit), then export DOCX and
   PDF from the resolved CV into a per-user storage bucket. *Why now:* the tailored CV currently
   breaks Parag's standing cap rule and ends on screen, so real applications still go through
   CVbuilder by hand. Deps: confirm Supabase storage free-tier allowance.
4. **Cover letter from the honest gaps** (M). Premium-tier draft built on `applicationGaps`: the gaps
   the CV cannot claim become the letter's argument, only evidenced facts named, frozen with the CV
   on send. *Why now:* the honesty rule makes the letter necessary, and it is the most visible
   `coming` step in Applying. Deps: item 3's resolved-CV structure for shared export; the
   letters-corpus question below.

## Next

5. **Networking, minimum CRM** (M; Parag leads). A contacts page (add, warmth, firm, office), an
   interaction log that sets `nextFollowupDate`, contacts shown on watched companies, and a
   first-message draft from `buildMessageContext` (premium tier, needs a provider method). The
   substrate - tables, repo, follow-up rules, network signal in the fit score - already exists.
6. **Improve, step one: record outcomes properly** (S). Stage reached, who closed it, free notes;
   answers DESIGN §7 Q7. Everything else in Improve reads this, so it goes first.
7. **Improve, step two: pattern and pointers** (M). Rules first - where applications stall by stage,
   sector, CV variant - then one small-tier call that turns the pattern into three concrete changes
   to CV, stories or case approach. Deps: 6, and a few closed applications to read.
8. **Link answers to CV bullets** (S). Let an interview answer name its bullet so
   `numberConsistency` checks spoken and written numbers against the CV, not just the draft.
9. **Drill the weakest dimension** (S). Pick practice from the lowest-scoring dimension in
   `interview_attempts` and `case_sessions`. Deps: enough attempts to be meaningful.
10. **"Why this fits you"** (S). Two lines per shortlisted role, small tier, only for roles above a
    score threshold, from bullet IDs not documents. Deps: 1.
11. **Morning brief page** (S). Surface `/api/brief` (new roles, follow-ups due, stale applications)
    on `/app`; schedule it with the sourcing cron. Deps: 1, better with 5.

## Later

12. **Offer & negotiation** (M). Target package at onboarding, offer comparison, and a slot for
    Parag's negotiation framework as DATA (like `cases.json`); then an AI counterpart rehearsal on
    the case-room loop. Build when the framework arrives or an offer is near.
13. **Onboarding from a CV / LinkedIn upload** (L). Parse once, `mergeSkeletons`, provenance guard.
    Needed for peers, not for Parag, whose bank is already loaded. Resolve DESIGN §7 Q1 first.
14. **Peer readiness** (M). Self-serve or invite-only (SPEC §10 Q7), the tailoring caps as per-user
    settings, theme per account, token budget view per user.
15. **More cases** (S each) from the runners-up in the case source map.
16. **Broad mode sourcing** via Adzuna/Jooble for firms not on the watchlist (M). Only once the
    watchlist is clean.

## Open questions for Parag

- **Networking:** do you want to build the CRM yourself, or should a session build the minimum in
  item 5 for you to extend? And where do alumni names come from - a manual list, an INSEAD
  directory export, or only contacts you add? (Scraping LinkedIn is off the table.)
- **Cover letters:** can the four sent letters live somewhere private for the model to learn the
  format (DESIGN §2 "Open"), or should it work from the written description only?
- **Tailoring:** "system proposes, you edit" or "system decides, you review" (DESIGN §7 Q2)?
- **Sourced jobs:** do high scorers auto-create `saved` applications, or stay a shortlist (DESIGN §7 Q11)?
- **Brief delivery:** in-app only, or email as well (SPEC §10 Q5)?
- **Negotiation framework:** what form will it come in, so the data shape can be ready?

## Parked / not doing

- Scraping LinkedIn or any site that forbids it - use company boards and contacts the user adds.
- WhatsApp delivery of the brief - no free, reliable channel.
- Premium LLM "polish" of the whole CV - conflicts with diff-from-master and the honesty rule;
  revisit only as a line-level suggestion (DESIGN §7 Q3).
- Storing interview audio - transcripts only, by design.

## Log

- 2026-09-24 - first version, written against the code at commit `1e51c90`.
