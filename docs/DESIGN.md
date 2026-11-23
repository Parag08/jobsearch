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
   button on it (Pipeline: Add a job; landing: Continue with Google). Everything else is a
   secondary button, a text link or plain text. One action gets one name: Google sign-in
   creates the account on the first visit, so the landing has no separate "Get started"; the
   nav has a single Sign in, for readers who have scrolled past the hero.
2. **Colour means something.** System blue is for doing. Each pipeline stage has its own
   system colour so the board reads at a glance. Green is progress. Orange is "needs attention": an application gone quiet, a weak point, a point with no number.
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
| `--accent` / `--accent-text` | `#0071E3` / `#0066D6` | `#0A84FF` / `#409CFF` | the action colour (fills / text) |
| `--warm` / `--warm-text` | `#34C759` / `#1F7A37` | `#30D158` / `#4ADE74` | progress: offer, practised, covered |
| `--on-warm` | `#062B10` | `#00210A` | text on a green fill (white fails contrast) |
| `--stale` / `--stale-text` | `#FF9500` / `#B25000` | `#FF9F0A` / `#FFB340` | needs attention: no reply in 2 weeks, weak point, no number |
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
nothing), **Inter** everywhere else, then `system-ui`. Inter ships with the app
(`@fontsource-variable/inter` through `next/font/local`): fetching it from Google at build time
failed a deploy once. `--font-serif` and
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

### Overview (`/app/home`)

Added 2026-11-19 (Parag: the JobSearch name in the menu bar did nothing; he wanted a page that
reports from every page and keeps him applying, reaching out and practising). It opens from
the JobSearch name, which is its tab: on the overview the name takes the current-page pill,
like any tab (2026-11-19; a separate Overview tab beside a name that went to the same place
was one control too many). On phones, where the row folds into a menu, the menu lists
Overview by name. It is where sign-in lands. Parag tried and rejected a Three.js scene here:
the page has no animation.

- **Focal point:** a headline chosen from the week's real state (`lib/home/momentum.ts`: start,
  offer, interviews, goal met, streak, quiet, moving) and one button, the most useful next
  step (follow up, chase a quiet application, send the oldest saved one, add a first job,
  look at new roles, practise). Further steps sit under "After that".
- **Progress tab:** a card each for jobs applied, people reached and practice. Each shows its
  own streak (consecutive days, ending today or yesterday), a 14-day strip in the activity's
  colour (blue, purple, green), the total (applications, conversations, practice time in
  hours and minutes plus sessions) and this week against the goal in env (`HOME_GOAL_*`;
  unset = no goal shown). Practice time: a mock interview's recorded length, or its words at
  130 wpm; a case's time between turns, each gap capped at 10 minutes
  (`lib/home/practice-time.ts`). Then one tile per page (pipeline, experience, watchlist,
  interview, cases).
- **Insights tab:** what you are searching for (role families of the roles read) and what those
  roles ask for, each requirement marked on your CV / done but not written down / not on
  record (the same rules as `/app/insights`), with a link there for the full list and the gap
  plan.
- **Voice:** count effort, never failure. A closed application is a try ("Most close, and every
  one sharpens the next"). A quiet week is an invitation back in, never a scold.

### Navigation order

Decided 2026-11-19 (Parag: overview, then pipeline, then interview). The day's order first,
then the tools that feed it:

**Overview · Pipeline · Interview · Watchlist · Network · Insights · Experience · Assistant**

Network joined after Watchlist on 2026-11-20 (ROADMAP N1): you find a firm, then the people
in it, in the product loop's order (Sourcing -> Networking -> Applying).

The Bank page is labelled **Experience** and Agent **Assistant** since 2026-11-19 (critique 0.2,
1.4, 1.5: "Bank" read as finance; "Connections" would collide with contacts). URLs stay
`/app/bank` and `/app/agent`. Items in Experience are **points** everywhere.

On wide screens the JobSearch name is the Overview tab (its pill shows when you are there),
so the row reads **JobSearch · Pipeline · Interview · Watchlist · Network · Insights ·
Experience · Assistant**; the phone menu lists all eight.

Overview says what to do next; Pipeline is the applications; Interview is practice. Then
Watchlist finds roles, Insights says what they ask for, the Bank holds your evidence, and
Agent is setup, last. Sign-in, the signed-in redirect and the demo links land on the
overview (`APP_HOME` in `lib/auth/routing.ts`); "Back to pipeline" links on error pages
still go to the pipeline, as they say.

### Page anatomy (Bank, Watchlist, Insights, Pipeline)

- **Header:** large title, then one line of facts (`ui.facts`: dark number, soft label), the
  page's one primary action on the right when it has one. A fact is coloured only when the
  colour means something on that page (`data-tone`: Pipeline's open blue and applied indigo,
  stale orange, due blue); never by position.
- **Summary panel** (`ui.summary`): up to three stats side by side, stacking on phones. A
  stat is a soft label, a big tabular number or a bar, and one line of note or a link.
- **Meaning colours** for a whole split three ways (`ui.sumBar`, `ui.legend`, `ui.tag`,
  `data-tone`): **good** green (`--warm`), **mid** teal (`--tone-teal`), **attention**
  orange (`--stale`). Bank strength: strong / solid / weak. Requirements: on your CV / done,
  not on your CV / not on record.
- **Collapsible panels** (`<details>` styled as `ui.panel`, chevron right) for what is set
  once or is reassurance rather than work: Bank roles, Watchlist filters, "On your CV".
- **Labels:** slugs render through `familyLabel` (sentence case, acronyms kept: MBA, KPI,
  SaaS, B2B). Dates read "7 Sep" (`shortDate`), the year only when it isn't this one.
- **Rows:** monogram (stable tone hash), bold title, soft meta line joined by " · ", tags,
  and text-weight actions on the right (`ui.textBtn`: blue for the step forward, grey for
  Dismiss / Remove). Empty states are one sentence (`ui.none`), never a box in a box.

### Bank (`/app/bank`)

Redesigned 2026-11-19 (Parag: the elements were not where they should be; he wanted the
strength dots in colour and a way to edit any point that is wrong). The Bank is the single
source of evidence, so every point is editable in place.

- **Header:** the shared facts line, "34 points · 10 roles".
- **Summary panel:** three stats side by side (stacking on phones). CV readiness with the meter
  and one plain line (at 100% it says so; the per-role gaps live in To do, not here); point
  strength as a stacked bar in the three band colours with a legend; "Missing a number" in
  orange with a link that filters the page to those points (`?only=needs-number`).
- **To do:** the onboarding nudge queue as sentences (`lib/bank/display.ts` `todoItems`):
  "Add a number to “…”", "Add 2 more points to INSEAD", "Add the languages you speak". Each
  links to its role or point (a link into a collapsed role opens it first) and names the role
  on the right. Three shown, "Show N more" for the rest. No priority codes, no ids.
- **Roles:** one collapsible panel each, headed by the company monogram (same tone hash as the
  board), the company in bold and "role · dates · N points" in grey. Recent roles (this year,
  last year or present) start open; the rest start closed.
- **Points:** wording, then tags: "Needs a number" first in orange, the role family as the one
  coloured tag (tone hash of the family), up to four skills in grey sentence case with repeats
  and family echoes dropped, "+N" for the rest, and "N variants" as plain grey text.
- **Strength:** five dots filled to the score, all in the band's colour, with the band named
  under them so colour is never the only signal. Strong 4-5 green (`--warm`), solid 3 teal
  (`--tone-teal`), weak 1-2 orange (`--stale`). A point with no number shows at most 2, as
  the intake guard caps it (`effectiveStrength`), so the page and the editor agree.
- **Editing:** "Edit" appears on hover or focus (always visible on touch) and turns the row
  into the editor: wording, strength (tap a dot; 3-5 switch off while there is no number, and
  the hint says why), role family (free text with the existing families suggested), skills
  (comma separated), variants (labels fixed because CVs pick variants by label; text editable;
  removable; flagged for review when the main wording changes). Save is the one filled
  button; Esc cancels, ⌘↵ saves. "+ Add a point" at the foot of each role opens the same
  editor empty.
- **Deleting:** a red text link in the editor opens an inline confirmation on the danger wash
  that says how many CVs use the point and how many were sent, and that copies already made
  or sent keep it while those CVs leave it out from now on (export reads the bank).

### Interview tab, company first (`/app/interview`)

Rebuilt 2026-11-20 (Parag: "it should not be this difficult" - Behavioural / Technical / Cases
tabs plus General / My own / Company choosers; then "it has to be company specific, but it
doesn't have to be just company specific"). Full design: docs/FULL-INTERVIEW.md.

- **"Preparing for" strip** under the title: white lifted cards in a row (scrolls sideways on a
  phone, no scrollbar). **Practice** first, always ("Any interview, any day"), a hairline, then
  one card per company you're applying to: the pushed round's name ("Technical interview, 24
  Nov"), "Case and fit" for a consulting firm, or "From the job ad". The current one has a 2px
  accent ring. Pushed rounds come first. URL `prep=<slug>|general`; old `company=` and `q=`
  links still land (`lib/interview/prep.ts` `choosePrep`).
- **Opens on** the next company with a pushed round, else Practice.
- **A company's page:** "Company · Role" as h2 with the round in soft text; the **Full mock
  interview** card (`ui.fullLead`: bold title, one sentence on what it is, "Best 3.5/5" or "One
  in progress", **Open full interview** as the page's primary); then the questions split, its
  list grouped by what each question tests (competency, case-insensitive), no chooser. A
  consulting firm adds **Case interview** below with the case cards (the case room opens in
  place).
- **Practice:** underline tabs **Questions / Technical / Cases**. Questions leads with the
  **Full practice interview** card, then the split with a two-pill chooser **Question bank /
  Your own**.
- **The full interview room** (`full=1`, "← Back to the questions" above it) is the mock room:
  the orb stage, captions, mic and Type controls, **End and debrief**. The stage clock reads
  "4:12 · topic 3 of up to 8"; the agenda is never shown during the call. Lobby: **Start full
  interview** (or **Resume interview** + Start a new one), the interviewer line, tone, voice and
  hands-free, and "See your last debrief".
- **Full debrief:** the score card; **Your weakest moments, and a stronger version** (You said /
  Stronger, both quoted); **The path the interview took** (open by default): each topic with a
  verdict tag (Held up green, Partly teal, Did not hold orange), the moves made on it ("Probed:
  What you did, Went deeper") and a link to practise it alone; Fillers and delivery folded.
- **Role-play** is the third pill in the aid row ("· ready", "· build it", "· needs a model
  answer"). Open: **Build the role-play** (primary), then the exchange as transcript bubbles
  (Interviewer / Strong candidate, "Why it works: ..." in soft text under each candidate line),
  **Play it** (the line being read gets an accent outline; Stop), **Rebuild**, and an orange
  line when the model answer has changed since it was built.

### Interview question pane (`/app/interview`)

Clarified 2026-11-19 (Parag: "I don't know where my answer starts, where it ends, and where the
notes are").

- **Aid row:** under the question, **What good looks like** and **Model answer** are one row of
  pill toggles (border, chevron, the source "Written by you" beside the label); open, a pill
  turns accent-wash with a blue border and its panel shows right below the row, white, with a
  heading. Both can be open at once.
- **Sections:** Your notes and Your attempts are section headings (1rem, semibold, ink,
  chevron on the right, a hairline above), their meta ("Saved", the count) in soft text.
- **The model answer** sits in its own white card (`ui.answerCard`): ink text at 15px,
  1.65 line height, every line break its own paragraph with 12px between, a 72ch measure. The
  instruction ("Read it, close it, then answer in your own words") is a small soft line above
  the card, never inside it. **Edit model answer** is a text button under it.
- **Scores always carry their scale:** every score on screen is out of 5 and says so ("3.0/5"
  in lists and per skill, "3.0 / 5" as a heading), through `outOfFive` in
  `lib/interview/score.ts`; tooltips and screen readers get "Best score 3.0 out of 5". Never
  a bare number. Added 2026-11-19 (Parag: "3.0 out of how much?").
- **Leaving a call:** two buttons at the right of the call bar. **Discard** (a room-glass
  button) asks once, on the bar itself: "Discard this interview? You won't get feedback and
  nothing is saved", with **Keep going** and a red **Discard**; the voice and mic stop while it
  asks. Confirming goes back to Join interview with nothing scored or stored. **End** gets
  feedback, as before. Added 2026-11-19 (Parag: End always evaluated the answer).
- **After a mock interview:** a bar right under the stage, before any feedback: **Read
  transcript** (it opens directly below the bar), **Download transcript** and **Download
  report** (Markdown, built by `lib/interview/report.ts`, for keeping or a local model). Then
  the score card (score, bars in two columns, What worked and Do differently side by side),
  then folded rows with their counts in the title: Against the model answer (Covered /
  Missed / Said differently tags), How you handled the follow-ups, Fillers and delivery.
  **Try again** last. Model-written list items always read as text (`asText`): an object the
  model sends is turned into a sentence, never "[object Object]".
- **Rating the interviewer (full interview, finished):** in **Read transcript**, every interviewer
  line after your first answer (not the close) ends with a quiet row: "Good question?" and two
  pill buttons, **Good** / **Bad** (`aria-pressed`; the pressed one takes the accent wash; press
  again to clear). **Bad** opens a one-line field, "What should it have asked instead?
  (optional)", saved on Enter or blur. A short note above the transcript says why, with a
  **Download the eval set** link. Saved at once, "Saving…" / "Saved" beside it. Added
  2026-11-23 (Parag: measure the interviewer before fine-tuning it).

### Application (`/app/applications/[id]`)

Rebuilt 2026-11-19 (critique 5.2-5.13).

- **Header:** "‹ Pipeline" link, the company as the title, then role · Saved 7 Sep · Applied 9 Sep.
- **Stage stepper:** the seven stages from Saved to Negotiation as dots on a track in the stage
  colour scale, filled up to the current one (the current dot ringed). Any other stage is a
  click. While saved, the **apply strip** sits under it (2026-11-20, docs/APPLY-FLOW.md step 5):
  **Open the posting ↗** (the board link, when there is one), **Download CV** (PDF, once built),
  then **Mark as applied**, the primary once the CV exists. The line under it says to apply on
  their site with this CV, that the CV and letter are kept as sent, and, when
  `APPLY_FOLLOW_UP_DAYS` is set, that marking it applied sets the next step to "Follow up if no
  reply by 27 Nov" (only when no next step is set).
- **Arriving from Apply** (`?applied=`): a green strip "Ready to send: the posting is read and
  your CV is built for it. Open the posting, apply there with this CV, then mark it applied
  here." while saved; orange when the CV couldn't be built.
- **Add the posting:** an application whose posting isn't read (its board gave no text, or the
  read failed) opens with this panel first: "Its board didn't give us the text. Open the
  posting, copy the whole description and paste it here", a paste box and **Read the posting**
  (primary, "Reading…"). With the text kept but unread it says so and offers **Read it**. An
  error answers in orange under the box; on success the page reloads ready to send. **Close application…** opens the reasons: I withdrew,
  They said no, No reply, and I accepted an offer (from Offer on). A closed application says
  so in grey and calls it a try.
- **Next step:** a labelled field with Save.
- **What they're looking for:** family · seniority · city, then **You can show this** (green
  tags) and **Not on your record yet** (orange tags, "Address these in your cover letter"),
  then "Who can apply".
- **CV:** the summary line labelled as it prints, the lines as a plain list (no relevance
  scores), page-fit notes in a sentence, Download PDF / Word, **Rebuild CV**, and one line on
  whether it follows your experience or is kept as sent.
- **Cover letter:** fields labelled above ("What caught your eye about BCG?" with its helper,
  Addressed to, Otherwise the team); **Write cover letter**; once written, the editable text and
  downloads, with "Rewrite it from scratch" folded away.
- **Interview prep:** each theme with a tag in the meaning colours (Story ready, On your CV only,
  No story yet) and Practise; "Stories behind your CV: N still to write" folded.
- **One primary:** Build CV while there is none, else Mark as applied while saved, else none.

### Watchlist (`/app/watchlist`)

Refined 2026-11-19 (docs/UI-CRITIQUE.md section 10, W1-W10).

- **Order:** Roles found, Companies you watch, What to look for. With nothing watched yet,
  Companies leads: adding one is the invitation.
- **Header:** companies · open roles · in pipeline; **Check for new roles** (primary) only
  when a company is active. Boards are read when you press it; nothing runs on a schedule,
  so no copy promises "daily".
- **Roles found:** best fit, then newest, with roles already in the pipeline last
  (`lib/watchlist/display.ts` `orderRoles`). Each row: monogram, title opening the posting,
  "Company · City · Posted 3 days ago · via Greenhouse", a Fit tag, then **Apply**
  (a small accent pill, "Saving…" while it runs) and **Dismiss**. A saved row dims its title
  and shows **In pipeline · Open** in the progress green. Twenty shown, then "Show all N".
- **Apply** (2026-11-20, renamed from Save to pipeline, which replaced Shortlist): a small accent
  pill, "Preparing…" while it runs. It opens the role as an application at Saved, reads its
  posting from the board (the watchlist entry, the company directory or the role's own board
  link gives the token), builds the CV, and **goes to the application page** to send it. When
  the posting can't be read it still goes there, to the paste box. Only an outright failure
  stays here, as an orange strip at the top of Roles found.
- **Companies:** monogram, name (Paused tag, dimmed when paused), "Read from Greenhouse" or
  "Check by hand" in orange, the careers URL as a soft link, then "2 people you know" (or "Add
  someone you know") opening the Network tab for that company; **Pause / Resume / Remove**.
  **Suggested companies**: directory companies with a readable board you don't watch, as
  "+ Name" pills and **Watch all N**; hidden when the directory has none.
- **What to look for:** a collapsible panel, closed once set, whose head says what it does
  ("Singapore · 2 titles · 1 skipped"). Three equal boxes: Cities, Job titles to include, Job
  titles to skip.

### Network (`/app/network`)

Added 2026-11-20 (ROADMAP N1, the minimum CRM). Rules only; nothing on the page calls a model.

- **Header:** people · to follow up (blue when any) · talking or met. No primary button: the
  add form is a panel.
- **Order:** **Follow up** (due today or overdue, oldest first) when any; then **People**
  ("Everyone else" when Follow up shows), soonest follow-up first, then those without one by
  name; then **Add a person**. With nobody yet, Add a person is the whole page.
- **Row:** monogram of the name, the name (opens their LinkedIn when a link was given), a status
  tag (in conversation blue, met green, awaiting reply teal, not contacted / dormant grey) and a
  warmth tag (hot orange, warm teal, cold grey); "Role · Company · how you know them"; "Last:
  <summary> (Channel, 18 Nov)" or "Nothing logged yet." On the right, the follow-up: blue "Follow
  up in 3 days", orange when due or overdue ("2 days overdue"), grey "No follow-up set".
- **Log a conversation** (a fold under each row, its count beside it): date (today), how
  (LinkedIn, WhatsApp, Email, Coffee, Call), what was said, and an optional follow-up date
  ("Empty: set from warmth": hot 3 days, warm 7, cold 14, `lib/outreach.ts`). Coffee or a call
  marks them Met; a first message marks Awaiting reply. Under it the history as a thin timeline,
  then Warmth / Where it stands / Next follow-up with **Save changes**.
- **Add a person:** "Name or LinkedIn link" (a pasted profile link fills the name from its slug),
  company, role, how you know them, warmth (the option says its cadence), an optional LinkedIn
  link. The link is stored as a link and never opened (decided 2026-11-10). Adding someone
  already there finds them instead. A bad link or no name answers in orange under the form, and
  the form keeps what was typed.
- **After an action:** a green strip names the person ("is in your network", "is logged. Follow
  up on 4 Dec.") and the row glows once (`:target`; none with reduced motion).
- **From elsewhere:** the Pipeline's "follow-ups due" fact and its Follow-ups due panel link
  here; each Watchlist company row says "2 people you know" or "Add someone you know", opening
  this page filtered to that company (`?company=`, with the add form's company filled in).

### Insights (`/app/insights`)

Refined 2026-11-19 (docs/UI-CRITIQUE.md section 10, I1-I11).

- **Words:** the Overview's, from one place (`lib/insights/display.ts`): **Not on record**
  (orange), **Done, not on your CV** (teal), **On your CV** (green). Never "gap",
  "unstated" or "evidenced" on screen.
- **Picker:** role families as pills in sentence case with a count; the selected one is the
  blue accent (not green, which means covered). **Filter by title** as its own search
  field, with Clear.
- **Summary panel:** roles read in the selection and "Based on 5 of your 7 roles"; what they
  ask for as a three-colour bar; Not on record as the big number (green 0 says nothing is
  missing). Unread roles and the result of reading sit in a notice row at its foot with
  **Read N now**; when reading is off, it says so in a sentence, never an env var name.
- **Groups:** Not on record, Done not on your CV, the plan, then On your CV (collapsed).
  Empty groups are not drawn. Each row: the term in sentence case, "Also written as …",
  "Asked by 2 of 3" with a bar in the group's colour, and a link into the Bank: "Mentioned
  in Valeo Health: add it as a point" (to the role) or "Backed by 3 points" (to the first
  point, scrolled to and flashed).
- **Plan for the gaps:** **Make a plan for these gaps** is the page's one primary; the plan
  reads at the 68ch measure with "Written … from N roles" under the heading. The panel is
  not drawn when there is nothing to plan and no plan.

### Demo (`/demo`)

Added 2026-11-19. The public demo is the real app on a made-up person's workspace, so a
visitor learns by clicking rather than watching a video.

- **Who:** Maya Okafor, a fictional product manager in Singapore (`data/demo/`, the same file
  shapes as `data/cvbuilder/`). Every company in it is made up and every contact line is an
  `example.com` placeholder. The owner's own corpus never reaches a visitor.
- **Entry:** "Try the demo" in the landing nav and "Try it with sample data" under the hero,
  shown only while `DEMO_MAX_VISITORS` is set. Both are plain links (not prefetched), because
  `/demo` sets the visitor cookie and goes to the Overview.
- **Banner:** one accent-wash strip under the nav: who this is, that AI answers are
  pre-written and changes last two idle hours, then **Start your own** (the one primary, to
  `/signin`) and **Leave demo** (quiet). It stacks on a phone. The nav pill says "Sample data";
  there is no Sign in or Sign out beside it, because the banner already offers the way out.
- **Behaviour:** each visitor gets their own copy (`lib/demo/visitors.ts`): applications
  spread across the pipeline, a watchlist with roles, two written answers, two practice
  attempts and one contact (`lib/demo/extras.ts`). Every AI feature answers from
  `lib/demo/canned.ts` after a short pause, through the same parsers and guards as a real
  reply. Watchlist refresh does nothing, the interviewer uses the browser's voice, and
  Assistant tokens cannot be made.

### Logo — Stages

Four dots rising, each more solid than the last: the pipeline from `saved` to `offer`, in
`currentColor`.

The favicon (`app/icon.svg`) is the same mark: the same dots and opacity ramp, in the accent
on a white tile (`#0071E3`), or `#0A84FF` on a near-black tile when the browser is in dark
mode. It can't read CSS variables, so its colours are copied from the tokens. Change it
whenever the logo or the accent changes. Don't put `--` inside its XML comments: that makes
the SVG invalid and the icon disappears.

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
- **Palette: Apple-style blue and white** (2026-11-19, Parag, replacing Sage Studio) — system blue (`#0071E3`, Apple's web blue, so white text passes contrast) on white cards over `#F2F2F7`, a system colour per stage, green for progress, San Francisco / Inter, capsule buttons (§5). Sage Studio (2026-11-11) and Heather before it are retired.
- **Pipeline is a Kanban board** (2026-11-19, Parag's reference: Twinkle on Dribbble) — a column per working stage even when empty, grey tracks, lifted cards with a role-family tag and a company monogram, Add a job as the page's one primary action.
- **Light by day, dark by night** (2026-09-24). Still no `prefers-color-scheme` inversion. A toggle in
  both navs cycles Auto / Light / Dark; Auto follows the viewer's local clock (dark 19:00-07:00).
  Its icon is the theme in effect, a sun or a moon; in Auto a small "A" sits on it (a clock
  face was a riddle; critique 1.7). Drawn after mount, since the browser's clock decides it.
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
- **Company first, practice always there** (2026-11-20, Parag; supersedes the next entry's
  chooser). The tab opens on who you're preparing for; the company decides the kind of interview
  (pushed round, case and fit, or from the job ad), so there is no type to pick. Practice holds
  the bank, your own questions, technical and cases, and its own full interview for days with no
  interview coming up.
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
- **Settings is one page of grouped panels, one field per row** (`/app/settings`, 2026-11-22): label,
  the control, then a muted help line that also says what blank means. A sticky glass save bar at the
  bottom; errors sit under their field in the page's own words, never env names. Model pickers list
  the job's ranked models first (★ = best your plan allows), then the rest of your plan, cheapest
  first, each with an estimated cost per interview; "needs credits" is a tag, not a disabled option.
