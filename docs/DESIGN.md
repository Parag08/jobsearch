# JobSearch — feature design

**Status: design only.** No implementation detail, no schema DDL, no service signatures. Decisions
that are settled are stated as decisions; everything still open is collected in §6.

Companion docs: `docs/SPEC.md` (the seven-module product map), `docs/ONBOARDING.md` (first-run flow),
`CLAUDE.md` (design rules), `docs/MEMORY.md` (running work log).

---

## The features

| # | Feature | What the user does | Where the code stands |
| --- | --- | --- | --- |
| 1 | **Onboarding** | Sign in, upload a CV or LinkedIn PDF or talk it through, get a first CV | Designed in full — `docs/ONBOARDING.md`. Nothing built. |
| 2 | **JD → cover letter + resume** | Paste a JD, get two tailored documents back, download as PDF or DOCX | Scoring and diff built and tested. **The editorial layer and rendering do not exist.** |
| 3 | **STAR interview prep** | Prepare behavioural answers from the exact CV an interviewer read | New — an eighth module, not in SPEC's seven. Nothing built. |
| 4 | **Company-targeted sourcing** | Name target companies, get their open roles daily | Mapper, table and scorer built. **No fetching, no watchlist, no scheduler.** |

They share one spine: the **watchlist** (4) feeds **scoring** (4), scoring feeds the **pipeline** (M5),
and the pipeline's `applied` transition both **freezes the sent documents** (2) and **scopes interview
prep** (3).

---

## 1 · Onboarding

Designed in full in **`docs/ONBOARDING.md`** — eight screens, two distinct questionnaires, two
synchronous doors (upload CV / LinkedIn profile PDF / screenshots, or talk it through), three honesty
guards at intake, and a nudge queue for everything deliberately deferred.

Only one thing here changes if feature 3 is accepted: **the gap interview's question ladder**. See §3.

---

## 2 · JD → cover letter + resume

### The flow

```
Paste JD -> extract once -> application opens in `saved`
         -> select bullets -> editorial pass -> page fit
         -> review + edit -> export (PDF | DOCX) -> mark applied (freezes the record)
```

### What already works

`processJd` extracts the JD once and opens the application; `tailorCv` scores the bank against the
stored extract, builds a diff from the role-family master, and persists it. `buildDiff` enforces the
honesty rule: a JD keyword is mirrored only when the bullet bank evidences it.

### What is missing: the editorial layer

`selectBullets` + `buildDiff` produce **a candidate set, not a CV**. The gap is documented in the
corpus itself — `data/cvbuilder/applications/bain-tig-consultant.json`'s notes are effectively the
spec for this section:

> *"pinned nutanix-sales-acv (scored 4)… The scorer buries them because this JD never says revenue or
> ACV, but a PE tech-diligence reader is scanning for exactly those."*

Six mechanisms the human uses and the code has none of:

| Mechanism | What the corpus shows | Notes |
| --- | --- | --- |
| **Pin against the ranking** | reader intent beats keyword overlap | needs a reason recorded per pin |
| **Page budget and trades** | *"paid for by the Technologies line, trimmed to one line… that buys a whole bullet"* | requires the page-fit model below |
| **Per-org cap** | Valeo and EverHaus capped at two each | `CLAUDE.md` rule 3, unimplemented. Surfaced to the user at onboarding screen 3 as *full story / one-liner / omit* |
| **Variant selection** | four bullets re-angled to mirror JD wording | `Bullet.variants` and `CvDiff.variants` exist; nothing ever picks one |
| **Collision audit** | vp-roadmap and sales-acv make the same argument | two bullets, one story, wasted lines |
| **Repeated-phrase audit** | `overrideText` to clear a repeat across the page | a pure reword, never a new claim |

### The page-fit model

The corpus already carries one: application files hold `pageSize` and `scale`, and the Bain note
reports *"Page still fits at scale 1 with zero overflow, still 16 bullets."* So a tailored CV is a
laid-out page with measurable overflow, not a list of strings.

That model is what makes `CLAUDE.md` rule 3's second selection rule enforceable: **prefer a short
variant over cutting a bullet** when the page runs long. Without measured overflow there is no way to
know a page ran long, and the rule cannot be honoured.

### Storing what was generated — decided

A tailored CV is stored as a **recipe**, not a document: `application_cvs` holds the master it came
from, the diff, the resolved bullet order and the summary line. That is token rule #4 working as
designed.

The problem: `bullet_ids` are references into **mutable** rows. Session 5's re-sync rewrote point text
in place, so an application CV can silently stop describing the page that was actually sent. Onboarding
screen 6 makes this worse by design — its default edit mode updates the point everywhere.

**Decision:** freeze on **send**, not on generate.

- While an application sits in `saved`, the CV stays a live recipe. Edits to the bank flow through,
  which is what a draft should do.
- On the transition to `applied`, snapshot the fully resolved text. `appliedAt` is already stamped
  exactly once, and that is the moment the document leaves the user's hands.
- The snapshot is **only a record of what was sent**. The master CV and the per-role-family CVs stay
  fully editable afterwards; freezing an application never freezes the bank.

This is the change that flips `CLAUDE.md`'s drop-and-recreate policy to numbered migrations, since it
is the first thing entered through the app rather than regenerated from `data/cvbuilder/`.

### Export — decided

- **Storage: a Supabase storage bucket.** The free tier includes file storage (~1 GB), which holds
  thousands of CVs at typical size. Bucket policies must be per-user, matching the RLS posture of every
  table. *(Verify the current free-tier allowance before building.)*
- **Formats: the user downloads PDF or DOCX.** DOCX matters wherever an ATS wants an upload rather
  than a paste. Both render from the same resolved CV structure, so they cannot drift.
- `application_cvs.file_path` already exists for exactly this and has never been written.

### The cover letter

**What it is for**, from the corpus:

> *"Deliberately does NOT claim technology due diligence as a skill — he has never run one, and that is
> the headline gap to raise in the cover letter rather than a line to write on the CV."*

That division of labour falls straight out of the honesty rule: **the CV states only what the bullet
bank evidences; the cover letter is where an honest gap gets addressed.** The rule makes the letter
necessary rather than decorative.

The mechanic is confirmed empirically. That note was written when the Nutanix diligence was a gap; by
the time the TIG letter was sent, `nutanix-move-diligence` existed as a real point — and the letter
**opens** with that story. Gap → letter → later a bullet, once the evidence exists.

### The format

Derived from four letters actually sent (Bain General, Bain TIG, BCG Singapore, FTI), 7 September
2026. **Bain General Consulting is the canonical example** — hold it unchanged as the reference.

**Shape:** a date, a salutation, **exactly three paragraphs**, a close. No bullets, no headings, no
postscript. Roughly 380–450 words; one page with room to spare.

```
7 September 2026

Dear <named individual>,            ← team name only when no individual is known
                                      ("Dear Tech Insights Group Recruitment Team,")

¶1  Career spine, ending at INSEAD
¶2  Why this firm, specifically
¶3  Where I would be useful, logistics, close

Yours sincerely,
Parag Rahangdale
```

**¶1 — the spine.** Compresses the whole career into one paragraph and always lands on *"I am
completing my MBA at INSEAD."* Names the same four anchors every time: the decade in software ending
at Nutanix, the UAE home-healthcare summer, founding member at a blockchain startup, product
strategist at a Singapore proptech platform.

Two openers, and the choice is editorial:

| Opener | Used when | Example |
| --- | --- | --- |
| **Career-first** | the role wants the operator record | *"I have spent more than ten years building software…"* (Bain General, TIG) |
| **Story-first** | the role wants the consulting arc | *"This summer I spent two months as a management intern at Valeo Health…"* (BCG, FTI) |

Companies are **named when the letter leads with their story** and **anonymised when they are
supporting** — "Valeo Health" in the BCG and FTI letters, "a home healthcare provider in the UAE" in
the two that lead with Nutanix. Same fact, different prominence.

**¶2 — why this firm.** The most demanding paragraph and the one that cannot be faked. It names
something the firm actually does or believes that is **not** marketing copy, and it earns the praise
by first admitting scepticism:

> *"I have read enough consulting marketing to be wary of it, so what held my attention about Bain was
> the inconvenient parts."*

What each letter found: Bain — tied economics, candour as a named value, Bill Bain founding on results
rather than reports. TIG — that it pairs consultants with people who have run software products, across
the whole investment lifecycle. BCG — Bruce Henderson, *Perspectives* from 1964, essays sized for a
coat pocket, the vocabulary the firm wrote. FTI — that Strategy & Transformation sits inside Corporate
Finance and Restructuring, and the Gulf healthcare build-out.

The paragraph closes by turning the research into a want: *"That is the kind of consulting I want to
practise."* / *"That is what draws me to TIG in particular."*

**¶3 — where I would be useful.** Opens on a fixed move — *"It is also where I think I would be useful
to you"* — then makes the signature argument: **he has lived on the implementation side, so he knows
the specific ways a good recommendation dies.** That argument appears in three of the four letters as
a triad of concrete failures, reworded each time:

- *"the roadmap nobody sequenced, the process that quietly assumed a team twice the size, the change
  that was announced rather than adopted"*
- *"the process that quietly assumed a team twice the size, the tool nobody adopted because nobody
  asked the people who would use it"*
- *"the model whose assumptions nobody revisited, the process that quietly assumed a larger team, the
  tool nobody adopted…"*

**This is a variant bank at paragraph scale** — the same claim, re-angled per reader, exactly as
`Bullet.variants` works for CV lines. It should be stored and selected, never regenerated.

Then logistics — *"I graduate in December and am available from Spring 2027"*, extended where the
posting asks (FTI's February/September starts, willingness to travel) — and a fixed close: *"I would
welcome the chance to talk, and thank you for your time and consideration."*

### Voice rules

Observed without exception across all four:

- **No contractions.** "I have", "it is", "do not" — never "I've", "it's", "don't".
- **British spelling** — organises, modernising, specialised.
- **Almost no numbers.** This is the sharpest split from the CV: the CV carries the metrics, the letter
  carries the narrative. The Valeo story appears in three letters and the 30% never does.
- **No superlatives and no enthusiasm words** — no "passionate", "excited", "thrilled", "world-class".
- **Real people are named where they are real evidence** — Aryaman the BCG consultant, Mallika Gokarn
  and Ariel Levy at TIG. This is the M4 contact graph doing work inside the letter, and it is only
  usable when an actual interaction exists.
- Plain declaratives. The rhetorical weight sits in specificity, never in adjectives.

### What the generator needs

1. **The gap** — JD requirements with no evidencing bullet (`applicationGaps` in `lib/editorial/`),
   so ¶3 can address honestly what the CV left quiet.
2. **The firm's inconvenient detail** for ¶2 — the one thing the system cannot invent. It has to come
   from the sector node, the JD itself, or the user, and if none of them has it, the letter must ask
   rather than generate a plausible-sounding claim about a firm. **A fabricated fact about the
   employer is the worst possible failure of the honesty rule.**
3. **The contact graph** (M4) — whether a real conversation with someone there exists.
4. **The bullets on the page**, so the letter amplifies the CV instead of repeating it.
5. **A paragraph-level variant bank** for the recurring ¶3 argument and the fixed openers and closes.

### Open

Storing the four letters as corpus data would let the system learn the format directly rather than
from this description — but they name recruiters and alumni, and **this repository is public**. They
are not committed for that reason. **Decided 2026-11-10:** Parag agrees the model may learn from the
letters; the corpus lives somewhere private (a per-user storage bucket), never in this repo.

---
## 3 · STAR interview prep

An **eighth module**. `docs/SPEC.md` has seven; interview prep appears only in passing (M5's
*"interview Thursday: here's the sector brief and likely questions"*).

### The core problem: a CV bullet cannot be decompressed

A CV bullet is the Result-forward **compression** of a much longer story. *"Cut 400+ critical security
risks to 20"* contains no Situation, no Task, and no Action. Asking a model to expand it into STAR is
asking it to invent the constraints, the pushback, and what the user personally did versus their team.

That is the honesty rule's failure mode, and it is **worse here than on a CV**: these words get said
out loud to someone who asks a follow-up question. A fabricated CV line is a risk; a fabricated
interview story collapses in real time.

**Therefore: STAR stories are captured, never generated.** A model may reshape what the user said. It
may not supply what the user did not say.

### Which makes this an onboarding decision

The gap interview in `docs/ONBOARDING.md` §3.4 already asks three questions per point:

| Gap-interview question | STAR |
| --- | --- |
| What were you responsible for? | **S / T** |
| What did you actually change? | **A** |
| How do you know it worked? | **R** |

The ladder is already STAR-shaped. If intake captures the fuller answer rather than only the
compressed bullet, **one interview produces both the CV line and the interview story**, and the bullet
becomes a derived projection of a richer record.

Decide this **before** onboarding is built. Deciding it after means re-interviewing every user for
stories they already told.

### What falls out cheaply

- **Prep scoped to the exact page they read.** `application_cvs` already stores the precise bullets
  sent per application, and §2's freeze-on-send makes that record trustworthy. Prep is not generic —
  it is the CV in the interviewer's hand.
- **Number consistency, guaranteed.** The story and the bullet derive from the same point, so the
  system can ensure the user never says "about 30%" against a CV that says 30%.
- **A story gap report.** JD extract → likely competencies → map to stories → *"you have no story for
  failure, conflict, or influencing without authority."* Structurally identical to `gapAnalysis` in
  `lib/sector-graph.ts`.

### Case interviews (Casing tab)

A live case interviewer, Bain-style and candidate-led: you drive, ask for data, and the interviewer
hands it over only when asked. Type or talk (browser speech; only text leaves the page).

- **Cases are data** (`data/interview/cases.json`, validated by `lib/interview/case-sheet.ts`): prompt,
  facts released on request, and a path of questions - structure, brainstorm, math, chart,
  recommendation - each with what a strong answer contains and the answer with its working. The ten
  shipped cases each keep the flow and central insight of a published casebook case, re-set in tech
  M&A and PE with fictional companies and new numbers; the source map lives with the user's casebook
  library, not in this public repo.
- **Code owns the path; the model only talks** (`lib/interview/case-session.ts`). Code decides the
  current question, asks the next one, puts exhibits on the table, and checks math deterministically
  (`checkMath`, scale-aware). Models proved reluctant to move a case on, so code guarantees progress: a
  correct answer closes a math question and each question has a turn cap. The model's line is then
  guarded: any figure not already in the case or the conversation, or a repeated nudge, is replaced
  with a neutral prompt - a practice tool must never teach a wrong number.
- **The bar is shared** (`lib/interview/case-method.ts`): the same "what good looks like" steps go into
  the interviewer's prompt and onto the page.
- **Debrief** (premium tier): six dimensions scored against the case's own answers, plus measured
  signals (math right, clarifying questions, how far you got). The model answer unlocks after.
- **Saved every turn** (`case_sessions`, migration 0002), so a refresh resumes the interview.
- Turns use the small tier for speed; the gateway plan allows 5 requests a minute per model, so a
  rate-limited turn tells you and re-sends itself after the wait. `npm run case:drill -- <id>` plays a
  simulated candidate against the real interviewer as a live check.

---

## 4 · Company-targeted sourcing

### Two modes, not one

`docs/SPEC.md` M7 assumes aggregator feeds. Targeting named companies is a different job:

| Mode | Source | Answers |
| --- | --- | --- |
| **Broad discovery** | Adzuna, Jooble — keyword + geography | *What is out there that I did not know to look for?* |
| **Watchlist** | The company's own ATS board | *Everything open at the companies I care about* |

Same `sourced_jobs` table, different cadence and different scoring weight.

### Why aggregators are wrong for the watchlist

Adzuna and Jooble search a **partial index**. Coverage of any one company is unreliable and lags the
source, so filtering aggregator results by company name will quietly miss postings.

Most companies expose their board as public JSON, free and unauthenticated — and a posting appears
there *before* it reaches any aggregator:

| ATS | Public endpoint shape |
| --- | --- |
| Greenhouse | `boards-api.greenhouse.io/v1/boards/<token>/jobs` |
| Lever | `api.lever.co/v0/postings/<company>?mode=json` |
| Ashby, SmartRecruiters | comparable public board APIs |
| Workday | per-tenant search endpoint, POST-based, messier |

Free and keyless keeps rule 5 intact. *(Verify each shape before building — stable but lightly
documented.)*

**The cost is a per-company mapping**: which ATS, which board token, discovered once. Design answer —
the user pastes the company's careers-page URL and the system derives ATS and token where it can, with
a manual fallback.

### The watchlist is new

Nothing in the schema holds target companies. The nearest thing is `sector_nodes.companies`, which
accumulates companies **observed in pasted JDs** — incidental, not intentional. A company the user is
targeting but has never pasted a JD for does not exist in the system at all.

A declared target must outrank an incidentally observed one in scoring.

### Three things that break with two sources

1. **Dedupe is within-source only.** `unique (user_id, source, external_id)` means the same role from
   Greenhouse and from Adzuna lands twice. Needs a cross-source identity — canonicalised URL, or
   normalised company + title + location.
2. **No dedupe against the pipeline.** M7 requires "never resurface something already applied to";
   nothing checks `applications` today.
3. **Scoring buries good hits.** A role at a declared target company should surface even when its
   title overlaps the bullet bank poorly — *"Senior Associate, TIG"* matches nothing lexically and is
   exactly what the user wants. Company signal is currently capped at the same weight as everything
   else and title overlap can drown it.

### Scheduling

**GitHub Actions cron** is the better host than Vercel Cron: free, flexible schedule, `ci` and `db`
workflows already run there, and it reaches Supabase over the session pooler **without putting a
database credential into the Vercel runtime**. Caveats: Actions cron is best-effort and can be delayed,
and scheduled workflows are disabled after prolonged repo inactivity. Neither matters at daily cadence.

Vercel Cron on the Hobby plan triggers once per day with a small cap on job count — also sufficient,
but it needs the credential in the runtime.

### The boundary

ATS public endpoints and aggregator APIs are fine. **LinkedIn and Indeed scraping is not** — and
`docs/SPEC.md` M4 already took that position: *"no scraping, no API, no ToS risk — it's his own browser
view."*

**Revised 2026-09-23 — a company's own careers page is now in bounds.** The original rule said "no
scraping" full stop. That was aimed at LinkedIn and Indeed: ToS-protected aggregators whose whole
business is the listing data. It over-reached. A company's own careers page is public, unauthenticated,
server-rendered, and published precisely so people read it. Reading ST Engineering's board is not the
same act as scraping LinkedIn's.

The line, stated so it cannot drift:

| In bounds | Out of bounds |
| --- | --- |
| Public ATS JSON endpoints | LinkedIn, Indeed, Glassdoor, any aggregator |
| A named watchlist company's own careers page, server-rendered, no auth | Anything behind a login or a paywall |
| Polite rate limits, honoured `robots.txt`, identifying User-Agent | Headless-browser evasion, rotating IPs, CAPTCHA solving |

Only companies the user has explicitly named are fetched. This is not a crawler.

### Board discovery, and why a token that answers proves nothing

`data/singapore/companies.json` holds the seed list (company, type, careers URL) and
`npm run boards:probe` fills in the verified ATS and token. The type matters more than it looks: it
records **how an employer hires**, which the 2026-09-23 run showed is the dominant variable.

The trap, found the hard way: **a board token that returns postings is not evidence the board belongs
to the company.** Probing by name alone produced four confident false positives —

| Token | Assumed | Actually |
| --- | --- | --- |
| `mas` | Monetary Authority of Singapore | an HVAC company in Hillside, Illinois |
| `edb` | Singapore EDB | EnterpriseDB |
| `sia` | SIA Engineering | Sia Partners (consulting) |
| `bcg` | Boston Consulting Group | somebody's test board in Tampa |

All four answered with real, current jobs. Unchecked, the pipeline would have fed Illinois HVAC
vacancies into a Singapore product search — and nothing downstream would have noticed, because every
later stage trusts the source.

So a token is accepted only with corroboration: the board's own employer name matching at comparable
length (a fragment match is how "Sia" passes for "SIA Engineering"), or the employer's domain appearing
in its job links, or a token long and unambiguous enough to stand alone. Strictness costs false
negatives — `lever/nium` is genuinely Nium, but only its subsidiary's name in the posting text says so
— which is why `confirmed: true` exists for boards a human has checked. **Prefer a false negative: a
missed company gets a manual check, a false positive silently poisons everything downstream.**

### Coverage is inverted against what the user needs

After probing 71 employers, by type:

| Type | Companies | Readable as JSON |
| --- | --- | --- |
| US tech (APAC) | 20 | **19** |
| Fintech | 14 | 6 |
| Regional platform | 9 | 2 |
| Bank | 6 | **0** |
| Consulting | 6 | **0** |
| Defence / engineering | 4 | **0** |
| Telco | 2 | **0** |

The companies the pipeline reads best are the ones staffing Singapore as a **sales hub** — 185 roles
across those boards, two of them product. The companies that actually hire product here — Sea, Shopee,
GoTo, Lazada, Carousell, the banks, ST Engineering — are almost entirely invisible to it.

That is the argument for the HTML route: not completeness for its own sake, but because the JSON
boards systematically cover the wrong half of the market.

---

## 5 · Design system

> **Re-themed 2026-11-19: Apple-style blue and white replaces Sage Studio.** Parag chose it
> after comparing it with a navy-and-cobalt option ("Harbour"), and asked for the colourful
> version. The rebuild also applies the seven checks from "How to make AI-generated UI look
> expensive" (Griffin Wooldridge): one focal point per screen, spacing on a 4/8 scale,
> hierarchy from weight and colour rather than size, colour only where it means something,
> real content, consistent details, and motion that starts where you acted. The pipeline
> board follows the Kanban pattern Parag pointed to (Twinkle, Dribbble): columns as soft
> tracks, lifted white cards, a coloured tag and a round badge per card, an add button at
> the foot of the first column.
> **The tokens in `app/globals.css` are the source of truth;** this section explains them.

### Principles

1. **One focal point per screen.** The one action a screen is for is the only filled blue
   button on it (Pipeline: Add a job; landing: Get started). Everything else is a secondary
   button, a text link or plain text.
2. **Colour means something.** System blue is for doing. Each pipeline stage has its own
   system colour so the board reads at a glance. Green is progress. Orange is "gone quiet".
   Red is fenced to destructive confirmations: a rejection is never red, closed is grey.
3. **Hierarchy from weight and ink.** Titles are bold and tightly tracked, only a step bigger
   than body. Secondary text is a softer grey, never a smaller size alone.
4. **Objects lift, pages don't.** Cards (things you open) are white with a soft layered shadow.
   Page sections sit on the grouped grey, separated by space and a hairline.
5. **Motion answers you.** Menus and sheets grow from the control that opened them, open in
   200ms and close in 120ms. Nothing animates on its own except the landing demo and the
   interview orb. `prefers-reduced-motion` turns it all off.
6. **No uppercase labels, no monospace labels.** Sentence case everywhere; monospace only for
   real code (the agent setup command, tokens).

### Colour

Light is iOS grouped: white cards on `#F2F2F7`. Dark is true black behind raised greys, with
the brighter dark-mode system colours. Every role has a light and a dark value.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--paper` | `#F2F2F7` | `#000000` | page canvas (grouped background) |
| `--card` | `#FFFFFF` | `#1C1C1E` | cards, panels, sheets |
| `--track` | `#E9E9EE` | `#121214` | pipeline column tracks |
| `--line` / `--line-strong` | `#E5E5EA` / `#D1D1D6` | `#2C2C2E` / `#3A3A3C` | hairlines |
| `--ink` | `#1D1D1F` | `#F5F5F7` | text |
| `--ink-soft` / `--ink-faint` | `#6E6E73` / `#76767B` | `#AEAEB2` / `#8E8E93` | supporting text, meta |
| `--accent` / `--accent-text` | `#007AFF` / `#0066D6` | `#0A84FF` / `#409CFF` | the action colour (fills / text) |
| `--warm` / `--warm-text` | `#34C759` / `#1F7A37` | `#30D158` / `#4ADE74` | progress: offer, practised, covered |
| `--on-warm` | `#062B10` | `#00210A` | text on a green fill (white fails contrast) |
| `--stale` / `--stale-text` | `#FF9500` / `#B25000` | `#FF9F0A` / `#FFB340` | no reply in 2 weeks |
| `--danger` | `#FF3B30` | `#FF453A` | destructive confirmations only |

**Stage colours** (the dot in each column head, the landing demo):

| Stage | Light | Dark |
| --- | --- | --- |
| saved | `#C7C7CC` grey | `#48484A` |
| applied | `#5AC8FA` light blue | `#64D2FF` |
| screening | `#5856D6` indigo | `#5E5CE6` |
| interview | `#007AFF` blue | `#0A84FF` |
| case | `#AF52DE` purple | `#BF5AF2` |
| offer | `#34C759` green | `#30D158` |
| negotiation | `#28A745` deep green | `#32D74B` |
| closed | `#AEAEB2` grey, whatever the reason | `#636366` |

**Tag tones** (`--tone-{blue,indigo,purple,teal,orange,pink}` plus `-wash`): card tags and
company monograms. Tag text uses the darker shade of each system colour so it passes contrast
at 11px. Which tone a role family or company gets is a stable hash (`lib/pipeline-display.ts`),
so the same family is always the same colour.

**The interview room** stays dark in both themes, like a FaceTime call (`--room-*`, a
`#2C2C2E` to `#0D0D0F` radial).

### Type

One family. **San Francisco** where the system has it (`-apple-system`, so Apple devices load
nothing), **Inter** (via `next/font`) everywhere else, then `system-ui`. `--font-serif` and
`--font-mono` are kept only as aliases that resolve to it; real code uses `--font-code` (the
system monospace).

| Role | Size | Weight | Tracking |
| --- | --- | --- | --- |
| Landing headline | clamp(2.4rem, 5.6vw, 3.75rem) | 700 | -0.035em |
| Page title (large title) | 2rem | 700 | -0.025em |
| h2 | 1.25rem | 700 | -0.015em |
| h3 / card title | 1.0625rem / 0.875rem | 700 / 600 | -0.01em |
| Body | 16px (floor) | 400 | -0.006em |
| Small, labels, meta | 0.8125rem | 400-600 | 0 |
| Tags | 0.6875rem | 600 | 0 |

Digits that stack take `tabular-nums`.

### Radius and elevation

Nested surfaces take a smaller radius than their container so the curves line up:
`--radius` 8px (controls, chips, tags) inside `--radius-card` 12px (cards) inside
`--radius-panel` 16px (panels, column tracks). Buttons and floating glass are capsules
(`--radius-button`, `--radius-float`: 999px).

Shadows are soft and layered, never one heavy blur, and only on things you can pick up or that
float: `--shadow-card` (pipeline cards; `--shadow-card-hover` lifts 1px on hover) and
`--shadow-glass` (nav, menus, the Add a job sheet). Page sections have none.

### Glass

Unchanged habitat: the sticky nav, menus, sheets, popovers, toasts and the landing demo card.
Never content cards, rows, fields or the page background. Mandatory fallback where
`backdrop-filter` is unsupported.

### Layout

| Token | Value |
| --- | --- |
| Every app page | `72rem` max, the pipeline included: one width for all tabs, so switching never resizes the page |
| Prose measure | `68ch` |
| Spacing | 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64; panels pad 24 |
| Board columns | `minmax(160px, 1fr)` (six fit in 72rem); on phones 82% wide with scroll-snap |

### Motion

| Token | Value | Use |
| --- | --- | --- |
| `--motion` | 140ms `cubic-bezier(0.2, 0, 0, 1)` | hovers, state changes |
| `--motion-open` | 200ms, same curve | menus and sheets opening |
| `--motion-close` | 120ms `cubic-bezier(0.4, 0, 1, 1)` | closing gets out of the way faster |
| `--spring` | `cubic-bezier(0.32, 0.72, 0, 1)` | landing only (nav pill, demo) |

Menus and sheets set `transform-origin` at the control that opened them (the mobile nav menu
top-left, Add a job top-right, top-left on phones). Buttons press to `scale(0.98)`.

### Logo — Stages

Four dots rising, each more solid than the last: the pipeline from `saved` to `offer`, in
`currentColor`.

### Earlier systems

Heather (one violet on white, to 2026-11-11) and Sage Studio (sage on warm oat with terracotta,
to 2026-11-19) are retired. Sage Studio was dropped because its oat-and-terracotta palette with a
serif display and monospace eyebrows read as the generic AI-generated look (`docs/UI-CRITIQUE.md`
section 9).

## 6 · How they connect

```
Watchlist + feeds  ->  scored shortlist  ->  saved application
                                                  |
                            paste JD  ->  extract (once)
                                                  |
                        select -> editorial pass -> page fit -> review
                                                  |
                              export PDF / DOCX  +  cover letter
                                                  |
                                       mark APPLIED  ---- freezes the sent record
                                                  |
                                            interview
                                                  |
                            STAR prep scoped to the frozen CV
```

Two load-bearing joints:

- **`applied` is the freeze point.** It stamps `appliedAt` once, snapshots the documents, and is what
  makes interview prep trustworthy. Everything downstream of it reads a record, not a live recipe.
- **The bullet bank is the single source of evidence.** The CV selects from it, the cover letter
  addresses what it cannot evidence, and STAR expands what it compressed. Nothing downstream may
  introduce a claim the bank does not hold.

---

## 7 · Open decisions

**Blocking**

1. **Does onboarding intake capture STAR-shaped material?** (§3) Changes the gap-interview ladder.
   Cheap now, expensive after onboarding ships.

**Feature 2**

2. ~~How much of the editorial layer is automatic?~~ **Decided 2026-11-10: system proposes, you edit.**
3. Premium LLM polish on the final CV — yes/no, and at what monthly cap? (`SPEC.md` §10 Q6)

**Feature 3**

5. Scoped per application, a general story bank by competency, or both?
6. Predicted questions per JD, or only the story bank plus a gap report?
7. Where do interview notes and outcomes live? M5 links "interview notes"; no such table exists.

**Feature 4**

8. The actual target-company list — and is it global or per sector node?
9. ATS mapping: derive from a pasted careers URL, or maintain by hand?
10. Cross-source dedupe identity — canonical URL, or normalised company + title + location?
11. ~~Do high-scoring sourced jobs auto-create `saved` applications?~~ **Decided 2026-11-10: yes**,
    above a score threshold.

**Still open elsewhere:** `docs/ONBOARDING.md` §6 (four decisions), `docs/SPEC.md` §10 (seven).

---

## 8 · Decisions taken

- **Output is a cover letter and a resume** — two documents per application.
- **Exports live in a Supabase storage bucket**, per-user policies, free tier.
- **The user downloads PDF or DOCX**, both rendered from one resolved structure.
- **Freeze on send, not on generate.** The snapshot records what was sent; masters and per-family CVs
  stay editable.
- **STAR stories are captured, never generated.**
- **Watchlist companies are sourced from their own ATS boards**, aggregators handle broad discovery.
- **No scraping** — pasted or screenshotted input wherever a site has no API.
- **The cover letter format is fixed** (§2): three paragraphs — career spine ending at INSEAD, why this
  firm with a researched inconvenient detail, where I would be useful plus logistics. No contractions,
  British spelling, almost no numbers. Bain General Consulting is the canonical reference.
- **The letters are not committed** — they name recruiters and alumni and the repo is public. They may
  be used as a private corpus (2026-11-10).
- **Editorial layer: system proposes, you edit** (2026-11-10).
- **High-scoring sourced jobs auto-create `saved` applications** (2026-11-10).
- **Contacts are added by name or pasted LinkedIn URL**, stored as a link, never fetched (2026-11-10).
- **Palette: Apple-style blue and white** (2026-11-19, Parag, replacing Sage Studio) — system blue `#007AFF` on white cards over `#F2F2F7`, a system colour per stage, green for progress, San Francisco / Inter, capsule buttons (§5). Sage Studio (2026-11-11) and Heather before it are retired.
- **Pipeline is a Kanban board** (2026-11-19, Parag's reference: Twinkle on Dribbble) — a column per working stage even when empty, grey tracks, lifted cards with a role-family tag and a company monogram, Add a job as the page's one primary action.
- **Light by day, dark by night** (2026-09-24). Still no `prefers-color-scheme` inversion. A toggle in
  both navs cycles Auto / Light / Dark; Auto follows the viewer's local clock (dark 19:00-07:00).
- **Nested radius** (2026-11-19, replacing "radius encodes elevation"): 8 inside 12 inside 16, so
  curves line up; buttons and floating glass are capsules.
- **Liquid glass has a strict habitat** — sticky nav, sheets, popovers, toasts, the landing hero card.
  Never on content cards, table rows, form fields or the page background.
- **Objects lift, pages don't** (2026-11-19, replacing "only glass casts"): cards you can open carry a
  soft layered shadow; page sections are separated by space and a hairline.
- **Logo: Stages** — four rising dots encoding the pipeline, in `currentColor`.
- **Behavioural questions are generic; company questions come from your pipeline** (2026-11-10,
  Parag). No firm filter: a good story is a good story anywhere. "Why <company>?", "Why this
  role?" and "Your first six months" are built per live application from templates in
  `data/interview/questions.json` (`companyQuestions`), ids `company:<slug>:<template>`. The
  interviewer's only context about the firm is what the job description said.
- **The behavioural tab opens on the generic bank; company questions and your own are one click
  away** (2026-11-16, Parag: the company questions were crowding out the questions he practises
  daily). A chooser - General / My own / Company - sits above the list; Company shows one entry
  per live application's company. The view is the URL (`company=<slug>`, `scope=mine`, `q=`), and a
  linked question decides it (`lib/interview/scope.ts`). **My own** takes any typed question
  (`interview_custom_questions`, ids `custom:<row id>`), stored as one bounded line, scored on the
  shared rubric in `questions.json` (`customQuestion`) through the same mock interview as every
  other question, and marked in the prompt as the candidate's text, not instructions.
- **The interview page is stage-first and quiet** (2026-11-10): no card around the stage, one Join
  button on it, settings behind a gear (remembered per device), status as a dot and a word, icon
  call controls, guidance / notes / attempts folded into disclosures, status dots in the list.
  "Practise out loud" is gone - the mock interview with "no follow-ups" is the quick mode.
- **The mock interview is a meeting, and its AI agent is the one animated thing in the app**
  (2026-11-10, Parag's call). A Three.js orb (`agent-avatar.tsx`) on a deep forest stage (was violet-ink before Sage) that
  keeps its colours in both themes, like a video call. It moves with the interviewer's voice and
  yours; everything around it still follows the 120ms in-app rule. `prefers-reduced-motion` keeps
  it nearly still. Deliberately abstract, not a face. Captions replace the chat log; the
  transcript is one click away.
- **Red is reserved for destructive confirmations only.** Rejection states are never red; closed is
  neutral taupe whatever the reason.
