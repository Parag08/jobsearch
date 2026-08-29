# JobPilot — Feature Map & Planning Doc
### A composite job-search platform for Parag
*Planning document · v0.2 · August 2026 · Target geography: Singapore*

---

## 1. The idea in one paragraph

JobPilot is a personal job-search operating system built around one central intelligence: a living profile of **who Parag is** (projects, skills, sector expertise) and **what he's targeting** (sectors, roles, geographies — starting with **Singapore**). Every artifact he feeds it — a pasted JD, a LinkedIn profile screenshot, a coffee-chat note — makes the system smarter. Every output it produces — a tailored CV, an outreach message, a daily industry brief — draws on that shared knowledge. Seven modules, one brain — and a **token-economy layer** so each operating cycle costs as few LLM tokens as possible (see §6).

---

## 2. The seven modules at a glance

| # | Module | What it does | Feeds / consumes |
|---|--------|--------------|------------------|
| M1 | **Sector Intelligence** | Hierarchical, self-updating map of target sectors (e.g. IT → AI companies → AI in Singapore), enriched by every JD pasted | Feeds M3, M6, M7 |
| M2 | **Project & Experience Repository** | Canonical record of every project Parag has done, pre-processed into reusable achievement bullets tagged by skill and sector | Feeds M3, M4 |
| M3 | **CV Builder** | Master-CV-per-role-family model: refine a Product Management master CV once, then auto-tailor per JD by adding/subtracting from M2 | Consumes M1, M2; feeds M5 |
| M4 | **Outreach CRM** | Tracks INSEAD alums and other contacts, past conversations (LinkedIn / WhatsApp / coffee chats); generates targeted messages from an uploaded profile image or HTML | Consumes M2; feeds M7 |
| M5 | **Application Tracker** | Pipeline from JD → applied → screening → interviews → offer, created directly from the JD itself | Consumes M3; feeds M1 (outcome data) |
| M6 | **Daily Industry Download** | Morning brief on what's new in the sectors/roles Parag targets | Consumes M1 |
| M7 | **Sourcing Engine** | Surfaces new jobs and new people to reach out to, matched to sector map and network | Consumes M1, M4 |

---

## 3. Module detail

### M1 · Sector Intelligence

**Problem it solves:** "Sector" is not a dropdown. Parag's target might be *AI companies within IT, in Singapore* — three stacked dimensions (industry → sub-domain → geography), plus role family.

**Core concept — the Sector Graph:**

- Sectors are stored as tags with hierarchy: `IT > AI > Singapore`, `Consulting > Strategy > SEA`, etc.
- Each node holds: key companies, common role titles, in-demand skills, salary signals, recurring JD language, and hiring trends.
- **Auto-update loop:** every JD Parag pastes is parsed (LLM, once — the structured extraction is stored and reused everywhere, see §6) → classified into the graph → its skills, keywords and company info are merged into the relevant nodes. After 20 JDs, the "AI-in-Singapore" node knows the ten most-demanded skills there — evidence, not guesswork.

**Features**

- Paste-a-JD intake: one text box (or URL); extraction of company, role, sector path, skills, keywords, seniority, and location/visa notes — for Singapore, whether the employer sponsors an Employment Pass and any salary signals relevant to the EP/COMPASS points framework.
- Sector dashboard: per-node view of skill frequency, company list, and trend over time.
- Gap analysis: skills the sector demands vs. skills evidenced in M2 → "learn this / emphasise that" suggestions.
- Manual curation: Parag can create/merge/rename nodes so the taxonomy matches how *he* thinks.

### M2 · Project & Experience Repository

**Problem it solves:** rewriting the same experience from scratch for every application. Capture once, reuse everywhere.

**Data model — one entry per project:**

- Context (employer/school, dates, team size, Parag's role)
- What he did (raw narrative — brain-dump quality is fine)
- Quantified outcomes (numbers, %, $ — the CV gold)
- Skills demonstrated (tagged: hard, soft, tools)
- Sector relevance tags (linked to M1 nodes)
- **Pre-built bullet variants:** the AI pre-generates 3–5 phrasings of each achievement angled for different role families — a PM angle, a strategy angle, an ops angle — stored and editable, so CV building becomes selection, not generation.

**Features**

- Guided intake interview ("walk me through the project; what changed because of it?") — the AI asks the follow-ups that surface metrics.
- Import from existing CV / LinkedIn export to seed the repository fast.
- Bullet bank browsable by skill, sector, or role family.
- Freshness nudges: "this project has no quantified outcome yet."

### M3 · CV Builder (master-CV cascade)

**The three-layer cascade — Parag's key design requirement:**

1. **Layer 0 — Repository (M2):** everything, untailored.
2. **Layer 1 — Master CVs per role family:** e.g. a *Product Management master*, a *Strategy master*. Parag refines these by hand until each one is a strong general CV for that family. These are the quality anchor — human-curated, versioned.
3. **Layer 2 — Application CVs:** for a specific JD, the system starts from the matching master (never from scratch), then: swaps in more relevant bullets from M2, mirrors JD keywords (honestly — only skills actually evidenced), trims what the JD doesn't care about, and adjusts the summary line to the company/sector using M1 knowledge.

**Features**

- Role-family detection from the JD → picks the right master automatically (with override).
- Diff view: exactly what was added/removed vs. the master, each change traceable to a JD line or an M2 entry — Parag approves before export.
- Learn-back loop: edits Parag repeatedly makes to application CVs are suggested as updates to the master.
- ATS-safe export (DOCX + PDF), single-column, standard headings.
- Every application CV is stored and linked to its application record in M5.

### M4 · Outreach CRM (alumni network & beyond)

**Problem it solves:** targeted outreach requires remembering every prior touchpoint and knowing what the contact cares about.

**Contact record:**

- Identity: name, INSEAD class/programme, company, role, location
- Relationship: how connected, warmth level, who introduced
- **Interaction log:** every LinkedIn message, WhatsApp exchange, email, coffee chat — pasted or summarised, with dates
- Interests & hooks: what they posted about, mutual ground, favours owed/given
- Status: not contacted / awaiting reply / in conversation / met / dormant → re-warm

**The killer feature — profile-to-message:**

1. Parag uploads the contact's LinkedIn page as **screenshot or saved HTML** (no scraping, no API, no ToS risk — it's his own browser view).
2. The AI extracts role, history, posts, shared background.
3. It cross-references the interaction log (never repeat an ask, always reference the last conversation) and M2 (which of Parag's projects would interest *this* person).
4. It drafts channel-appropriate variants: **LinkedIn** (short, public-ish), **email** (structured, formal), **WhatsApp** (warm, casual) — each with a clear, small ask.

**Features**

- Follow-up cadence: "you said you'd circle back with Priya in 3 weeks — that's today."
- Outreach analytics: reply rate by channel, by message style, by ask type.
- Network-affiliation fields (for Parag: INSEAD class, section, club overlap — Singapore campus alums are a dense local asset) as first-class, configurable filters; other users plug in their own school or employer alumni network (see §7).

### M5 · Application Tracker

**JD-in, pipeline-out:** pasting a JD into M1 can spawn an application record in one click — company, role, sector, source, and deadline pre-filled from the parse.

**Lifecycle stages:** Saved → Applied → Screening → Interview 1..n → Case/Assessment → Offer → Negotiation → Closed (won / lost / withdrawn / ghosted).

**Features**

- Kanban + table views; drag between stages.
- Each record links: the JD, the exact CV version sent (M3), the referral contact if any (M4), interview notes, and next action + date.
- Nudges: "applied 14 days ago, no response — follow up?" / "interview Thursday: here's the sector brief (M1) and likely questions."
- Funnel analytics: response rate by sector, by CV master used, by referred-vs-cold — closes the learning loop back into M1/M3.

### M6 · Daily Industry Download

**Purpose:** make Parag sound like an insider in interviews and coffee chats.

- Sources: RSS feeds and Google Alerts keyed to M1 nodes (companies, sub-sectors, geographies), plus curated newsletters.
- An LLM pass every morning: dedupe → rank by relevance to *active* applications and *upcoming* conversations → 5-item brief with one-line "why this matters to you."
- Bonus links: "You're meeting an alum at Grab on Thursday — Grab appeared in today's news, lead with this."
- Delivery: in-app card + optional email/WhatsApp-to-self; weekly deep-dive digest per top sector.

### M7 · Sourcing Engine

**Jobs:**

- Pulls from free job-board APIs and RSS (see stack) filtered through the M1 sector graph — the more JDs pasted, the sharper the match profile.
- Dedupe against M5 (never resurface something already applied to).
- Daily shortlist scored by: sector fit, skill overlap (M2), and network proximity (M4 contact at the company = big boost).

**People:**

- For each shortlisted job: "who do you already know there or one step away?" (from M4).
- Suggested new contacts: alumni at target companies (via the user's own alum-directory lookups, pasted in — for Parag, the INSEAD directory with a Singapore-campus filter), 2nd-degree LinkedIn connections he flags.
- One-click handoff to M4 to start an outreach thread.

---

## 4. How the modules connect (data flow)

```
                 ┌────────────── JD pasted ──────────────┐
                 ▼                                        ▼
   M1 Sector Intelligence ◄──── outcomes ────  M5 Application Tracker
      │        │      │                              ▲
      │        │      └── sector brief ──► M6 Daily Download
      │        ▼                                     │
      │   M7 Sourcing ── new jobs ───────────────────┘
      │        │
      │        └── people to reach ──► M4 Outreach CRM ── referrals ──► M5
      │                                     ▲
      ▼                                     │
   M3 CV Builder ◄── bullets ── M2 Project Repository
        │
        └── application CV ──► M5 (linked to record)
```

**The flywheel:** JDs improve the sector graph → the graph improves sourcing and CVs → applications produce outcome data → outcomes tune what the CVs and outreach emphasise.

---

## 5. Architecture & free-first stack

**Guiding rule:** every component has a $0 default; paid options are opt-in, minimal, and swappable (no lock-in — data lives in exportable tables/files).

| Layer | Free default | Notes / paid fallback |
|-------|--------------|----------------------|
| App shell | Local-first web app (Next.js/SvelteKit) hosted on Vercel/Netlify/Cloudflare free tiers | Nothing paid needed at personal scale |
| Database | Supabase free tier (Postgres, ~500MB, auth included) or even Google Sheets/Airtable free to start | Supabase pauses inactive free projects — fine for active use; paid ~$25/mo only if it outgrows |
| LLM calls | Google Gemini API free tier (generous daily quota) and/or Groq free tier (fast open models) | Swappable via a thin provider layer; Claude/GPT API pay-as-you-go only for the highest-stakes generations (final CV polish) — likely a few $/mo |
| JD & profile parsing | Same LLM free tier; profile images via multimodal Gemini free tier | — |
| Job feeds (M7) | Adzuna API (free dev tier, covers Singapore), Jooble API (free on request), JSearch on RapidAPI (small free quota); Singapore-specific: MyCareersFuture (government board), JobStreet/JobsDB, NodeFlair and Tech in Asia via saved-search email alerts / RSS parsed into the app | Paid aggregator APIs only if volume demands |
| News (M6) | RSS + Google Alerts (free) + free newsletters; LLM summarisation on free tier | — |
| LinkedIn data | **User-supplied only** (screenshots / saved HTML / official data export) — free and ToS-safe | Never scrape; no paid data vendors needed |
| WhatsApp / email | Drafts generated in-app, sent manually by Parag (free, and more authentic) | No API costs |
| CV export | docx/pdf generation libraries (open source) | — |
| Scheduling (M6 daily brief) | Free cron (GitHub Actions / Cloudflare Workers cron / Supabase edge functions) | — |

**Cost reality check:** the whole system can run at **$0/month** on free tiers, with the only likely paid creep being premium-LLM calls for final CV drafts — capped, optional, and switchable per call.

**Switchability principle (Parag's requirement):** each module talks to providers through a small adapter (one file per provider). Swapping Gemini→Groq, Supabase→Airtable, or Adzuna→Jooble is a config change, not a rebuild.

---

## 6. Token economy — cutting tokens per operating cycle

Build-time token spend is one-off; what matters is the **recurring cost of each cycle** (tailor a CV, draft an outreach message, run the morning brief). Design rules, in priority order:

1. **Parse once, store structured.** Every JD, profile upload and conversation is parsed exactly once into compact JSON. Downstream steps consume the stored extraction — the raw JD (2–4k tokens) never re-enters a prompt.
2. **Rules and embeddings before models.** Matching and ranking (job scoring in M7, bullet shortlisting in M3, contact relevance in M4, news filtering in M6) run on free/local embeddings + cosine similarity and keyword rules — zero generation tokens. The LLM only re-ranks or writes over a top-k shortlist (e.g. summarise 8 pre-filtered articles, not 200 headlines).
3. **Reference, don't restate.** Prompts carry IDs and compact summaries, not documents: the CV-tailoring call sends the master CV + ~15 candidate bullets selected by embedding match, never the whole M2 repository; sector context arrives as the M1 node's cached 150-token summary, not its JD corpus.
4. **Generate diffs, not documents.** M3 outputs a change-list (add/remove bullet IDs, one rewritten summary line) applied programmatically to the master — ~10× cheaper than regenerating a full CV, and it makes the diff view free.
5. **Model routing.** Small/free-tier models handle extraction and classification; the premium model is reserved for the two moments quality is visible — final CV polish and important outreach drafts.
6. **Prompt caching + stable prefixes.** System prompts and master CVs are static per role family; ordering them first lets provider prompt-caching discount the repeated prefix on every call.
7. **Rolling summaries.** Interaction logs (M4) and sector nodes (M1) keep a maintained short summary; full history stays in the DB for lookup, out of prompts.
8. **Memoise.** Near-duplicate JDs (same role, same company family) reuse the previous tailoring as the starting diff; identical daily-brief items are never re-summarised.
9. **Token budget meter.** Per-module token counters and a per-cycle budget with alerts, so cost creep is visible before it hurts.

**Effect:** a naive tailor-CV cycle (full repository + raw JD + full CV in, full CV out) runs 30–50k tokens; with rules 1–6 it drops to roughly 4–8k, most of it cache-discounted. The morning brief goes from "LLM reads the internet" to a few thousand tokens over a rule-filtered shortlist.

---

## 7. Built for peers — generic multi-user design

Parag is user #1, not the schema. Everything personal is **data, not code**:

- **Workspace per user:** each user gets their own profile (target geographies, role families, sector-graph seeds), own M2 repository, own masters, own CRM. Row-level security in the DB (Supabase gives this free).
- **Configurable affiliations:** "INSEAD" is one instance of a `network` object (name, directory source, campus/class fields). A peer plugs in their own school, employer alumni group or community; all M4/M7 features work unchanged.
- **Geography and sources as config:** job boards, news feeds and visa-rule hints (e.g. Singapore's EP/COMPASS notes) live in per-geography source packs a user toggles on — adding a new country means adding a pack, not code.
- **Shareable templates, private data:** sector-node structures, master-CV skeletons, outreach message patterns and intake interview scripts can be exported/imported as templates between peers; the underlying personal data never leaves a workspace.
- **Optional community pooling (later):** peers can opt in to share anonymised sector-graph statistics (skill frequencies per node) so everyone's graph gets smarter faster — off by default.
- **Onboarding flow:** import CV/LinkedIn export → guided project interview (M2) → pick/create sector nodes → refine first master. A new peer is productive in one sitting.

---

## 8. Data model (core tables)

All tables carry a `user_id` (workspace) key. `users` (id, profile, target_geos[], role_families[], networks[]) ·
`sectors` (id, parent_id, name, geo, skills[], companies[], stats, summary_cache) ·
`projects` (id, context, narrative, outcomes[], skills[], sector_tags[]) ·
`bullets` (id, project_id, role_family, text, metrics) ·
`master_cvs` (id, role_family, doc, version) ·
`applications` (id, jd_text, sector_id, company, stage, cv_version_id, contact_id, next_action, dates) ·
`contacts` (id, name, insead_meta, company, warmth, status) ·
`interactions` (id, contact_id, channel, date, summary, raw_text) ·
`sourced_jobs` (id, source, url, score, status) ·
`briefs` (id, date, items[]) ·
`token_ledger` (id, module, call_type, tokens_in, tokens_out, model, date)

---

## 9. Phasing suggestion (for discussion)

- **Phase 1 — the spine (weeks 1–2):** M2 repository + M3 with one master CV (Product Management) + M5 tracker as a simple table. Immediate payoff: better CVs, no lost applications.
- **Phase 2 — the network (weeks 3–4):** M4 CRM + profile-to-message. Immediate payoff: targeted INSEAD outreach.
- **Phase 3 — the intelligence (weeks 5–6):** M1 sector graph auto-updating from the JDs already collected; M6 daily brief.
- **Phase 4 — the engine (ongoing):** M7 sourcing, analytics loops, learn-back into masters, token-budget dashboard.
- **Phase 5 — the peers:** once the workflows are proven on Parag, open workspaces to peers (the multi-user design in §7 means this is configuration and auth work, not a rebuild).

**Worth discussing:** Phase 1–2 could also run *inside Claude/Cowork today* — a folder structure + a few skills + scheduled tasks — as a zero-build pilot to validate the workflows before writing any code.

---

## 10. Open questions for Parag

1. Which role families get master CVs first? (PM confirmed — what's second: strategy? ops?)
2. How many active sector nodes to start — 2–3 focused (e.g. AI-in-Singapore, PM-in-SEA) or broad?
3. Is Singapore exclusive, or keep a UAE/GCC pack active in parallel?
4. Outreach volume target per week? (Drives how much CRM automation matters.)
5. Where should the daily brief arrive — in-app, email, or WhatsApp-to-self?
6. Comfort level with premium LLM spend for final CV drafts (e.g. cap at $5/mo)?
7. For the peer version: invite-only workspaces first, or design for self-serve signup from day one?
