# Screen-by-screen review

Reviewed 2026-09-10 against the live site, every route in `app/`. Severity is about what it costs
the user, not how hard it is to fix. Each finding says whether it was fixed in this pass.

---

## Blocking

### B1 · Demo is a dead end in production — **fixed**

The landing nav offers **Demo** and the hero offers **See it with sample data**; both link `/app`.
`getWorkspace()` returns demo only when Supabase is **unconfigured**. Now that production has
Supabase env vars, a signed-out visitor clicking either lands on `/app` → redirect → `/signin`.

Two of the four prominent calls to action on the front page lead nowhere. This appeared the moment
the env vars went in, so it was invisible during development.

**Fix:** the landing page checks `isSupabaseConfigured()` and drops both demo affordances in live
mode, promoting the honest CTA instead.

### B2 · No way to tell you can sign **up** — **fixed**

Reported directly: *"I cannot see the signup button on home page, the page shows as sign in only."*

The nav button said *Sign in*, and `/signin` was titled *Sign in*. Nothing on either surface told a
new visitor an account gets created. With OAuth there is no separate signup route — the same button
does both — so the burden is entirely on copy, and the copy did not carry it.

**Fix:** nav CTA becomes **Get started**; `/signin` is titled **Get started** with a subtitle stating
that continuing creates an account if you do not have one, and a secondary line for returning users.

### B3 · LinkedIn was offered but cannot work — **fixed**

`linkedin_oidc` is `false` in Supabase's own auth settings, so the button started an OAuth leg that
could only fail. Removed per instruction; Google only.

The note under the buttons explained LinkedIn import and is now stale — rewritten.

### B4 · An application cannot be created from the UI — **fixed**

The pipeline board was read-only. The only way to open an application was `POST /api/jd`, and the
application detail page told the user so in as many words:

> *"No structured extract yet. Paste the JD through POST /api/jd to parse it once."*

That is developer copy on a user surface, and it made the product's central loop — paste a JD, get a
tailored CV — unreachable without a terminal.

**Fix:** a **Paste a job description** form on the pipeline board, backed by a new `createFromJd`
server action calling the same tested `processJd`. When no LLM key is configured it says so plainly
rather than failing silently, because an extract cannot be faked (token rule: parse once, store
structured).

---

## Accessibility

### A1 · Amber-on-white fails contrast — **fixed**

`--stale` (`#B5904F`) was used as **text** at 13px on white — roughly 2.9:1, well under the 4.5:1 AA
floor. It appeared in `/signin`'s status line and the pipeline's stale counter.

The design system already anticipated this: §5 defines `--stale-text` (`#8A6B2E`) for exactly this
case. The code had not adopted it. Fills keep `--stale`; text now uses `--stale-text`.

### A2 · Accent as small text sits on the AA boundary — **fixed**

`--accent` (`#6F6A96`) on white is ≈4.8:1 — it scrapes past AA for normal text and fails the 3:1
non-text floor for thin marks. It was used for the landing eyebrow (11.5px uppercase), both brand
wordmarks, and several `/app` labels.

§5 defines `--accent-text` (`#55507A`, ≈7:1) precisely for this split. Text usages moved over; fills,
meters and the logo keep `--accent`.

### A3 · No current-page indication in the app nav — **fixed**

Pipeline / Bank / Watchlist rendered identically regardless of which was open. Added `aria-current`
plus a visible state, so it is conveyed to both sighted and assistive users.

---

## Missing surfaces

### M1 · No loading state — **fixed**

Every `/app` route is `force-dynamic` and does database round-trips. Navigation showed the previous
page frozen until the server responded. Added `app/app/loading.tsx`.

### M2 · The 404 page ignores the design system — **fixed**

`notFound()` on a missing application rendered Next's built-in error page — the one carrying its own
`prefers-color-scheme: dark` block, which is why a stray dark rule still showed in the live HTML
after the system committed to light. Added a themed `not-found.tsx`.

### M3 · No favicon — **fixed**

The tab showed Next's default globe. Added `app/icon.svg` drawing the Stages mark.

### M4 · Bank bullets are read-only — **deferred**

`docs/ONBOARDING.md` screen 6 specifies that a bullet needing a metric carries an inline *add a
number*. The bank marks them correctly but offers no way to fix one, so the nudge queue can only ever
grow. Needs a bullet-edit action and the provenance guard from `lib/onboarding/intake-guard`;
too large for this pass and it belongs with the onboarding UI.

---

## Design-system drift

### D1 · Off-scale heading — **fixed**

`.honesty h2` was `1.5rem`; the §5 scale has 1.75 and 1.25 and nothing between.

### D2 · Sign-in panel not vertically centred — **fixed**

`min-height: 100%` on a flex column left the panel hugging the top of a tall viewport with a large
void beneath. Now centred.

---

## Not faults, but worth deciding

- **The pipeline shows all eight stages as columns.** On a laptop that is a horizontal scroll with
  most columns empty. Collapsing empty stages, or showing `closed` as a drawer, would make the board
  readable — but it is a product call about whether the funnel should always be visible in full.
- **No cover letter surface anywhere.** DESIGN §2 promises two documents per application; the detail
  page shows only the CV. Blocked on the format (DESIGN §7 Q1).
- **No export.** `application_cvs.file_path` is still never written, so nothing can be downloaded.
- **Sign-in has no pending state.** The server action redirects to Google; on a slow connection the
  button looks inert for a moment. Needs a client component to show progress.
