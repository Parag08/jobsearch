# From a role you like to an application sent

Written 2026-11-20, from Parag: "there's no clear workflow from leads generated, to shortlisted,
to the tracker... I want it to flow very naturally." This is the design; ROADMAP items are at
the end.

## The path a user should walk

```
Set up         Find             Decide              Prepare                 Send            After
--------       -------------    ----------------    --------------------    ------------    -----------------
Experience  -> Watchlist     -> Save to pipeline -> Application page:    -> Open posting -> Follow-up date,
Targets        roles, scored    (one click)         fit, CV (auto),         Mark applied    interview prep
Companies                                           letter, questions       (CV frozen)     for this job
```

One rule runs through it: **every screen ends with the next step as its one primary button**, and
the step after it is never more than one click away.

## Where it breaks today

| Step | Today | Problem |
|---|---|---|
| Set up | Experience comes from the CVbuilder sync or MCP; targets and companies live on the Watchlist | A new user has no way in: no CV upload, no checklist saying what to do first |
| Decide | **Shortlist** only sets a flag on the role | Nothing reaches the pipeline. The user has to find the posting, copy it, and paste it into Add a job |
| Prepare | The application page has Build CV, letter and interview prep | Build CV is a button you must find, though it is free (rules only) |
| Send | **Mark as applied** | There is no link to the posting, so the user has to go and find it again |
| After | Next step is free text | No follow-up date, no prompt to practise for this role |

The board data is the quiet blocker: refresh keeps title, company and link but drops the
posting text, and the pipeline needs that text to work out what the role asks for.

## The design

### 1. Set up: a checklist on the Overview until it is done
A new user lands on the Overview, which shows three steps instead of streaks:
1. **Add your experience**: upload a CV or LinkedIn PDF (ONBOARDING.md step 2), or add points by hand.
2. **Say what you're looking for**: roles and cities. These are the Watchlist targets, asked here once.
3. **Pick companies to watch**: the suggested list, with one tap each.

Each step is a button that opens the right screen and comes back. The checklist goes away when
all three are done, and the general question bank is there from day one. Role-specific
questions arrive per application (step 4).

### 2. Find: the Watchlist shows roles worth a look first
This is already mostly there: roles from the boards, scored against the targets. Two changes:
- Each row says **why** it scored (the target title and city it matched).
- A role already in the pipeline shows **In pipeline · Open** instead of the buttons.

### 3. Decide: "Save to pipeline" replaces Shortlist
Shortlisted and Saved mean the same thing, so they become one action. **Save to pipeline**:
1. fetches that one posting's full text from its board (free, no tokens: Greenhouse and Lever
   already return it, Ashby has `descriptionPlain`, SmartRecruiters has a per-posting endpoint);
2. reads it once into what the role asks for (`processJd`, one small-tier call, logged);
3. opens an application at **Saved**, keeping the posting link as `apply_url`;
4. **builds the CV straight away**, since tailoring is rules-only and costs nothing;
5. marks the role `tracked` and shows a toast: "Saved to your pipeline · Open".

If the board has no text (unknown ATS), it opens the application with the link and asks you to
paste the posting, the same as Add a job does today.

### 4. Prepare: the application page as a short checklist
Top of the page, in order, each with a done state:
1. **Does it fit?** What they ask for, against your evidence (exists).
2. **CV**: already built; review, swap a point, download.
3. **Cover letter**: optional; needs one specific thing about the firm (exists).
4. **Practise**: the three questions this role is most likely to ask, with a link into the
   Interview tab filtered to them (exists as "Interview prep for this job").

### 5. Send: one place to apply from
**Open the posting** (the board link) sits next to **Download CV** and **Download letter**, and
**Mark as applied** is the primary button once the CV exists. Marking it applied freezes the CV
and letter as sent (exists), and:
- sets the next step to "Follow up if no reply" with a date seven days out;
- moves the card to Applied on the board.

### 6. After: the pipeline carries it
Cards past Applied show the follow-up date; the Overview's next-steps list picks up anything
overdue. Moving to Interview turns on the role's question set in the Interview tab.

## What it costs to run
Per saved role: one board request (free) and one small-tier model call to read the posting.
The CV costs nothing. The letter is one premium call, and only if the user asks for it.
The demo keeps answering from `lib/demo/canned.ts`.

## Build order (ROADMAP ids to assign)
1. **Save to pipeline** (steps 2-3) - **shipped 2026-11-20** (`lib/services/save-to-pipeline.ts`,
   `lib/watchlist/posting.ts`; the "why it scored" line is still to do): keep or refetch posting text per ATS, the action, the
   watchlist row states, auto-build CV. *Done when:* one click on a watchlist role opens an
   application with its requirements read and a CV built, and the role shows In pipeline.
2. **Apply strip** (steps 4-5) - **shipped 2026-11-20**: Save to pipeline became **Apply**, which
   always lands on the application (a paste box when the board gave no text, instead of the old
   dead end); the board token now also comes from the company directory or the role's own link;
   the strip has Open posting, Download CV and Mark as applied, which sets "Follow up if no reply
   by <date>" (`APPLY_FOLLOW_UP_DAYS`). Open posting, downloads, Mark as applied as the primary,
   follow-up date on apply. *Done when:* a user can go from Saved to Applied without leaving
   the page or searching for the posting.
3. **Setup checklist** (step 1) on the Overview for an empty workspace, using the targets and
   companies screens that exist. *Done when:* a fresh account sees the three steps and each one
   leads somewhere.
4. **CV upload intake** (ONBOARDING.md steps 2-4). This is the largest piece, and the only one
   that needs new parsing.
