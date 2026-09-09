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

That is a genuinely good division of labour, and it falls straight out of the honesty rule: **the CV
states only what the bullet bank evidences; the cover letter is where an honest gap gets addressed.**
The rule makes the letter necessary rather than decorative.

So the letter draws on three things the system already has:

1. **The gap** — JD requirements with no evidencing bullet. This is `gapAnalysis`'s output, per
   application rather than per sector.
2. **The sector node** — company and market context, so the letter sounds informed (M1, M6).
3. **The bullets actually on the page** — so the letter amplifies the CV rather than repeating it.

**Blocked:** the format itself. There is no cover letter anywhere in this repo — application files
carry `id, company, role, reference, jd, pageSize, scale, selection, updatedAt, notes` and no letter
field, and the only mention in the whole corpus is the prose note quoted above. The standing format
has to be supplied before this section can specify structure, length, tone or salutation
conventions. See §6.

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
view."* Keep it consistent: where a site has no API, the user pastes or screenshots, exactly as with
contacts.

---

## 5 · Design system

Visual proposal with all three palette options:
`https://claude.ai/code/artifact/c45039da-89d8-4ede-ac32-2eabbdb2442d`

### The governing principle

Most product palettes reserve red for errors — something went wrong, the user should fix it.
JobSearch inverts that. Its most frequent negative states are `lost`, `withdrawn` and `ghosted`, and
**none of them is a user error**. They are the ordinary arithmetic of applying: most applications end
this way, for reasons outside the applicant's control. Colouring them red turns a dashboard into an
accusation and makes the most common outcome the loudest thing on screen.

> **Closed states get the quietest colour in the system, not the loudest. Progress gets the accent.
> Nothing shouts.**

Everything below serves that: low chroma throughout, one accent hue, a near-white ground rather than
pure `#FFFFFF`, and semantic colour spent only where a decision actually depends on it.

### Palette — Heather (chosen)

Muted periwinkle on a faintly cool white. Calm without reading as either "finance blue" or "wellness
green". Neutrals are biased toward the accent hue rather than pure grey, so they read as chosen.

| Token | Light | Dark |
| --- | --- | --- |
| `--ground` | `#FBFAFC` | `#17161B` |
| `--surface` | `#FFFFFF` | `#1E1D24` |
| `--ink` | `#2C2A33` | `#E9E7EE` |
| `--ink-soft` | `#726F7C` | `#ABA8B5` |
| `--ink-faint` | `#98959E` | `#7E7B88` |
| `--line` | `#E7E5EC` | `#2E2C36` |
| `--line-soft` | `#EFEEF3` | `#24232B` |
| `--accent` | `#6F6A96` | `#A49EC6` |
| `--accent-soft` | `#E3E0EC` | `#2C2938` |

The dark accent is lightened rather than inverted, so it holds contrast on the dark ground without
turning into a different colour.

### Stage scale

The accent deepens as an application advances, so progress is legible without reading a word.
Terminal states step **sideways into neutral**, never down into red.

| Stage | Colour | Why |
| --- | --- | --- |
| `saved` | `#EEEDF1` | Barely marked — an intention, not a commitment |
| `applied` | `#E3E0EC` | The accent enters, at its lightest |
| `screening` | `#D5D1E3` | Someone read it |
| `interview` | `#B3ADCB` | Deepening |
| `case` | `#8F89B0` | Deepening |
| `offer` | `#6F6A96` | Full accent — the only place the palette reaches full strength |
| `negotiation` | `#595478` | Deepest |
| `closed` | `#98959E` | Neutral taupe **whatever the reason** — won, lost, withdrawn or ghosted. The reason is a word, not a colour |

### Semantic colour

Only two states earn colour outside the scale, because a decision depends on each:

| Meaning | Colour | Trigger |
| --- | --- | --- |
| Stale | `#B5904F` | Past `STALE_AFTER_DAYS = 14` with no response |
| Due today | `--accent` at full | A follow-up is due (`nextFollowup`) |

Nothing else in the interface is allowed to be urgent. **Red is reserved for genuinely destructive
confirmations only** — deleting a project, deleting an account — and appears nowhere else.

### Typography

| Role | Face | Weights | Used for |
| --- | --- | --- | --- |
| Display | **Newsreader** | 400 | Headings, CV preview, empty states |
| Body | **IBM Plex Sans** | 400 / 500 / 600 | Body copy, UI, forms |
| Data | **IBM Plex Mono** | 400 / 500 | Scores, dates, ids, anything aligning in a column |

Newsreader carries warmth without nostalgia and keeps the interface from reading as a CRM. Plex Sans
is humanist enough to sit beside it and neutral enough to disappear in a form. Plex Mono is a true
sibling of the body face, so data never looks pasted in from another system. Use
`font-variant-numeric: tabular-nums` wherever digits stack.

### Layout tokens

| Token | Value |
| --- | --- |
| Radius | 3px cards · 999px chips |
| Elevation | none — 1px borders only |
| Spacing | 4 · 8 · 12 · 16 · 24 · 40 · 64 |
| Measure | 34rem (~65ch) |
| Motion | 120ms ease-out, opacity + 2px translate only |
| Borders | 1px, never 2 |

**No shadows anywhere.** A shadow implies something floating above something else, which implies
urgency; a 1px hairline separates just as clearly and stays silent. Radius stays small — heavily
rounded cards read as playful, and this product asks the user to concentrate.

### Logo — Stages (chosen)

Four dots rising left to right, each more solid than the last. The mark **encodes the product's
actual spine** — the pipeline from `saved` to `offer` — rather than decorating it, and the growing
weight reads as progress without needing an arrow. It is also the only one of the three proposals
that stays legible at 16px, because it has no enclosed counters to fill in.

- Monochrome, drawn in `currentColor`, so it inherits `--accent` or `--ink` from context.
- Opacity ramp `0.28 / 0.5 / 0.75 / 1.0`, mirroring the stage scale above — the mark and the pipeline
  use the same visual logic, so the logo teaches the interface.
- The final dot is larger (`r 4.4` against `r 3.2`), giving the sequence a destination.
- Lockup: mark at cap height, wordmark in Newsreader 400, gap equal to one dot diameter.

Rejected: **Doorway** (an open arch — ages well but risks reading generic) and **Match** (two
overlapping pages — closest to what the product literally does, but busiest at favicon size).

---

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

1. **The cover letter format.** Not in this repo. Paste one or two letters actually sent, or say where
   they live, and §2's cover letter section can be specified.
2. **Does onboarding intake capture STAR-shaped material?** (§3) Changes the gap-interview ladder.
   Cheap now, expensive after onboarding ships.

**Feature 2**

3. How much of the editorial layer is automatic — "system proposes, you edit" or "system decides, you
   review"? The six mechanisms are judgment calls.
4. Premium LLM polish on the final CV — yes/no, and at what monthly cap? (`SPEC.md` §10 Q6)

**Feature 3**

5. Scoped per application, a general story bank by competency, or both?
6. Predicted questions per JD, or only the story bank plus a gap report?
7. Where do interview notes and outcomes live? M5 links "interview notes"; no such table exists.

**Feature 4**

8. The actual target-company list — and is it global or per sector node?
9. ATS mapping: derive from a pasted careers URL, or maintain by hand?
10. Cross-source dedupe identity — canonical URL, or normalised company + title + location?
11. Do high-scoring sourced jobs auto-create `saved` applications, or stay a shortlist until promoted?

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
- **Palette: Heather** — muted periwinkle `#6F6A96` on `#FBFAFC`, light and dark tokens in §5.
- **Logo: Stages** — four rising dots encoding the pipeline, in `currentColor`.
- **Red is reserved for destructive confirmations only.** Rejection states are never red; closed is
  neutral taupe whatever the reason.
