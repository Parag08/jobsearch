# Onboarding — flow & product design

**Status: design only.** This is the agreed shape of the first-run experience. It deliberately
says nothing about implementation — no schema, no services, no API surface. Decisions still
open are listed at the bottom; everything above them is settled.

Related: `docs/SPEC.md` M2 (project & experience repository) and M3 (CV builder cascade);
`CLAUDE.md` rules 2 (token economy), 3 (honesty), 4 (generic multi-user).

---

## 1. What onboarding has to produce

The corpus is three levels deep (see `data/cvbuilder/`). Nothing is visible to the user until
all three are filled:

| Level | Shape | Where it comes from |
| --- | --- | --- |
| **Skeleton** | `org -> roles[]` with title, dates, location, blurb | upload, or 60s of typing |
| **Points** | bullet text + `roleId` + tags + strength | the interview — this is the real work |
| **Targeting** | target role + geography + selection knobs | the target questionnaire |

Targeting is what turns a bank into a *visible CV*. Without a target role there is nothing to
render at the end of onboarding and the dashboard opens empty — so it is asked **first**, not
last. It also seeds the first sector node, which is what makes job scoring work on day one.

**Minimum viable bank** for a credible one-page CV: identity + education + 2–3 recent roles +
~3 points each + one target ≈ **10 points**. Roughly 10–15 minutes. Everything beyond that is a
dashboard nudge, not a wall before the dashboard.

---

## 2. Two questionnaires, not one

They behave differently and must not be conflated — merging them makes the front door feel long
and the interview feel rigid.

- **Target questionnaire** (screen 1): structured, fixed set, ~60 seconds. Facts nothing else surfaces.
- **Gap interview** (screen 4): adaptive, conversational, driven by what the bank is missing. Length varies.

---

## 3. The flow

```
0  Sign in  (Google | LinkedIn)
1  Target questionnaire            -> targeting + profile extras
2  Seed the bank:  Upload what you've got   |   Talk it through
3  Confirm the skeleton            -> timeline, depth per role
4  Point harvest / gap interview   -> the bullet bank
5  Pick your proudest three        -> strength signal
6  First CV preview                -> the payoff, editable
7  Dashboard                       -> completeness meter + nudge queue
```

### 0 · Sign in

Google or LinkedIn. The copy must kill the wrong assumption on the spot: *LinkedIn sign-in gets
you in the door; it does not import your history — we ask for that next.* LinkedIn OIDC returns
name, email and picture only. Without that line, every LinkedIn signup reaches screen 2 confused
about why it is being asked again.

**Login and LinkedIn import are separate things and are presented separately.**

### 1 · Target questionnaire

1. **Roles you're targeting** — free text with taxonomy suggestions. Multi-select allowed; each
   target eventually becomes its own archetype.
2. **Where** — city/region. With (1) this keys the first sector node.
3. **Seniority** — optional; inferable from the skeleton if skipped.
4. **Work authorisation** — sponsorship needed in the target geography? Earns its slot: it stops
   the user burning weeks on postings that filter them out.
5. **Languages** — the sleeper question. A CV parse rarely surfaces them and nobody volunteers
   them in a career narrative, yet they are hard filters (see `docs/MEMORY.md`: no French, so
   Bain Montreal may be a hard filter — found by hand, late). Asking once makes that systematic.

Plus a small optional **profile extras** block on the same screen: certifications, publications,
awards, clubs. This is the material that never comes up in a "walk me through your job"
conversation and always ends up in the CV footer.

### 2 · Seed the bank — two doors

Doors are framed by honest cost, not by speed. Both are **synchronous**; nothing blocks on an
external system.

| Door | Gets you | Cost |
| --- | --- | --- |
| **Upload what you've got** — CV, LinkedIn profile PDF, screenshots, any combination | Skeleton + first-draft raw material | ~2 min, then the interview |
| **Talk it through** | Best bank, nothing inherited | 10–15 min of conversation |

Upload accepts multiple files at once and **auto-detects** what each one is, then asks the user
to confirm the detection rather than classifying it upfront. A LinkedIn "Save to PDF" has a
recognisable structure; a CV does not look like one.

**The two sources are not equivalent, and neither is a subset of the other:**

| Source | Text it yields | Value as raw material |
| --- | --- | --- |
| **CV** | Already compressed to bullets, metrics stripped to fit a page | Lossy — mining a summary of a summary |
| **LinkedIn PDF** | Verbose, first-person, unquantified prose | **Richer** — nothing pre-cut |

LinkedIn prose is bad CV copy and *good* intake material: M2 asks for exactly this ("raw
narrative — brain-dump quality is fine"). It also supplies a headline and an About section,
which are the natural first draft of the master CV's summary line. Door copy should say so: a CV
is what you already decided to say; LinkedIn is the longer version you have not edited down yet.

**Both files together is the strongest start.** Merge rule, stated rather than last-write-wins:

- **LinkedIn wins** on skeleton facts — exact dates, official titles, org names.
- **The CV wins** on bullet content and anything already quantified.
- **Show the user where the two disagreed** (a date rounded to a year, a title upgraded in the
  retelling). The disagreement is useful to see, not noise to resolve silently.

**Why upload rather than an API or an archive.** Same reasoning `docs/SPEC.md` M4 already
commits to for contacts: it is the user's own browser view of their own data — no scraping, no
partner API tier, no ToS exposure. One upload-and-parse capability serves both the bullet bank
and the CRM. The "Download your data" archive path is **cut**: its only advantage was exact
dates, which the profile PDF also has, and it makes the user wait on an email.

#### Format handling

**Prefer the PDF; offer images as fallback.** Tell people where it lives — on your own profile,
*More -> Save to PDF*. Most users do not know it exists. It is selectable text, so the parse is
cheap and reliable; per rule 2 a text parse costs a fraction of a vision call.

Two known lossy spots in LinkedIn's export, to design around rather than trust:

- It **truncates long descriptions** — flag any description ending mid-sentence as "looks cut off".
- It can **drop or partially include About and Skills** — treat a missing About as a gap to ask
  about, not as an absence of one.

**Screenshots**, because people take them badly:

- **Multiple images, order matters.** A profile does not fit one screen. Accept a batch, default
  to upload order, let the user reorder.
- **Overlap is the norm.** People scroll and shoot, so consecutive shots repeat a band of
  content. Dedupe on merge or the same role arrives twice.
- **Boundaries cut bullets in half.** Detect a fragment at the top/bottom edge, stitch it to its
  neighbour, flag it when that fails.
- **Layouts vary** — mobile vs desktop, dark vs light, different zoom. This is the argument for a
  vision model over OCR: OCR degrades badly on a two-column dark-mode mobile screenshot.

One vision call per user at signup is defensible, but route it deliberately and log it to the
token ledger like any other call.

**Keep uploads for the session, discard at the end.** During confirm the user wants their
screenshot beside what we read out of it. Hold the file while onboarding is live; drop the binary
when they reach the dashboard; keep the extracted text as the audit copy — the same shape as
`jd_raw`.

### 3 · Confirm the skeleton

A timeline of org -> roles. Cheap, high-confidence, high-trust: the user sees the system got
their career right *before* it starts making claims about it.

- **Depth per role** — mark each role *full story* / *one-liner* / *omit*. This surfaces the
  per-org cap from `CLAUDE.md` rule 3 as a user choice at the moment they are best placed to make
  it. It stops an internship outweighing a full-time role, and it is how the CV stays one page
  without the system silently cutting.
- **Gaps** — flag them, offer an optional note, never demand one.

### 4 · Point harvest / gap interview

Per role, a fixed three-question ladder:

1. **What were you responsible for?** (scope)
2. **What did you actually change?** (the arc)
3. **How do you know it worked?** (the metric)

Question 3 is the whole product. When the answer carries no number, do not accept the shrug and
do not invent one — offer proxies: *how big was the thing, what percent, how much time, how many
people, what budget, what was true before versus after.* Most people have a number and do not
think of it as one.

If there is genuinely nothing: **keep the bullet, mark it as needing a metric, cap its strength**
so it ranks below evidenced bullets. It stays in the bank and joins the nudge queue.

**Depth budget:** chase recent roles hard, older roles shallow. Show progress as *CV readiness*,
not questions remaining — a counter invites people to grind to the end or bail; a readiness bar
tells them when they have hit good enough.

#### The honesty guards at intake

Onboarding is the one place rule 3 has no enforcement. `buildDiff` protects tailoring because the
bank is ground truth — but here **the bank is being written**, so there is nothing to check
against. An LLM turning *"I owned the roadmap"* into *"Drove roadmap across 3 products, +20%
engagement"* poisons the well permanently, and the user gets asked about that number in an
interview.

1. **Provenance on every intake bullet** — which span of user input it came from. Restructuring
   wording is fine; introducing a noun, a tool name or a number the user never said is not.
   (Rule 3: naming a specific tool, firm or method is itself a claim.)
2. **Mark the gap instead of filling it** — an explicit "needs a metric" state, never a guessed
   figure. Strength capped until the user supplies one.
3. **Confirm, don't assert** — show *"you said"* beside *"on your CV this reads as"*. Accept /
   edit / discard, plus an explicit **"I never said that"** which is both a user escape and a
   fabrication signal worth logging.

### 5 · Pick your proudest three

One screen. Rather than asking someone to rate 20 bullets 1–5, ask for the top three — those get
top strength, everything else keeps its default. Thirty seconds instead of five minutes, and it
is the signal the ranker actually needs for tie-breaks.

### 6 · First CV preview

The payoff: a rendered one-pager for the target from screen 1.

- **Edits route explicitly.** Default is editing *the fact* — updates the point everywhere. A
  **"just for this CV"** toggle writes a variant or an override instead. Same model the CVbuilder
  corpus already runs on (`variants`, `additionalOverrides`, `exclude`). A plain textbox silently
  picks the first option and corrupts the bank.
- **Metric gaps visible in place** — a marker on bullets needing a number, with inline *add a
  number*. The empty slots are the best prompt to fill them.
- **"Why this bullet?"** — tap any line to see why it was selected and what was left out. This is
  the trust moment: it proves the system selects from evidence rather than writing fiction, and it
  teaches the user how tailoring will work on every future application.
- When the page runs long, **prefer a short variant over cutting a bullet** (`CLAUDE.md` rule 3).

### 7 · Dashboard

Handed over with a **completeness meter** and a **nudge queue** of everything onboarding skipped.

---

## 4. Deliberately deferred

Saying this explicitly is part of the design — the temptation is to ask for everything upfront.

- **Bullet variants** — generated on first tailoring, not at intake. Ten points x 4 variants is a
  lot of premium generation for someone who may abandon at screen 4 (rule 2).
- **Contacts / CRM import** (M4)
- **Sourcing preferences and feeds** (M7)
- **Additional archetypes** beyond the first target
- **Older roles' detail**, and every bullet still needing a metric

The **nudge queue is therefore a first-class feature**, not a leftover: it is the mechanism that
lets onboarding be 15 minutes instead of 45.

---

## 5. Flow properties to commit to

- **Every screen commits.** Not a wizard that loses everything on close. Someone who signs in,
  confirms a skeleton and leaves comes back to a real half-built bank — and the bank is usable
  (tailorable, however thinly) at any point after screen 3.
- **Any door can be re-run later.** A second CV six months on, or a fresh LinkedIn PDF, merges
  into the existing bank rather than forking it. The merge rule in §3.2 is permanent
  infrastructure, not onboarding-only.
- **A bad parse is a detour, not a dead end.** Two independent upload paths mean the fallback for
  a mangled CV is "screenshot your LinkedIn instead", not "give up and type".
- **Nothing personal becomes schema.** Targets, languages, geography, work authorisation are all
  DATA (rule 4). A new user starts with a shipped default taxonomy as a template plus their own
  proposed additions — not with Parag's vocabulary hardcoded.

---

## 6. Open decisions

1. **Bad-parse first impression.** When a CV parses badly (two-column, scanned, heavily styled),
   do we show the mess and ask the user to fix the skeleton, or fall back silently to another
   door? Leaning: **show the mess** — confirming five garbled lines is faster than typing five
   roles, and it sets the expectation that this is a collaboration. Genuine product call.
2. **Multi-target at signup.** Screen 1 allows multiple target roles, but only one master CV is
   rendered at screen 6. Do we render the first, ask which one, or render one and offer the rest
   as a nudge?
3. **Where the taxonomy for a new user comes from** — one shipped default template, several by
   target family, or derived from the user's own points on the first tag pass.
4. **Whether the interview is chat-shaped or form-shaped.** The ladder is fixed either way; the
   question is whether it presents as a conversation or as a structured per-role card.
