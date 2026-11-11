# Work log (newest first)

Keep this file updated at the end of every working session: what was done, decisions taken, what's next. CLAUDE.md holds the stable rules; this holds the moving state. Keep only the last two or three sessions here - move older entries to docs/MEMORY-archive.md so a fresh session stays cheap to start.

## 2026-11-11 (later) - ROADMAP Now #1, #3, #4: auto sourcing, a sendable CV, cover letters

- **Sourcing:** `lib/watchlist/retire.ts` (pure, 7 tests) closes a role missing from a board that
  answered on 2 refreshes running; failed boards never count. `refreshWatchlist` now also keeps the
  user's status (a re-run used to reset dismissed rows to new) and reports `retired`. New status
  `closed` + `missed_refreshes` (migration 0004). Daily cron `.github/workflows/sourcing.yml`
  -> `npm run watchlist:refresh`. **Needs repo secrets SUPABASE_URL + SUPABASE_SECRET_KEY.**
- **CV:** `tailorCv` now runs the editorial layer: per-org caps from profile `org_caps` (migration
  0005; data = `maxPoints` on Valeo and EverHaus in `data/cvbuilder/profile.json`, seed regenerated),
  then `fitToPage` when CV_PAGE_SIZE/CV_SCALE/CV_OVERHEAD_LINES are set (21 = calibrated so every
  CV in `data/cvbuilder/applications` fits). Decisions/actions/fit stored on `diff.editorial` and
  summarised on the application page. **Live caps apply only after `npm run db:seed`.**
- **Export:** `lib/export/{resolve-cv,docx,pdf,letter}.ts` - one ResolvedCv for both formats,
  frozen text once sent. `/api/export/<id>?format=pdf|docx[&doc=letter]`. Live mode keeps a copy in
  private bucket `cv-exports` (migration 0006, per-user folder policies; env CV_EXPORT_BUCKET) and
  writes `application_cvs.file_path`. Checked on all 5 real demo CVs.
- **Cover letter:** `lib/cover-letter` (brief, prompt, voice checks, assembly) +
  `lib/services/cover-letter.ts`; stored on `applications.cover_letter` (0007). Code owns date,
  salutation, the ¶3 opener, logistics, close and the triad variant (`data/cvbuilder/letter-bank.json`);
  the model (premium tier, gateway) writes three paragraphs. No firm detail -> asks, never invents.
  Checks: contractions, enthusiasm words, numbers not supplied, 3 paragraphs, word range. Editable;
  frozen once sent. The private letters corpus is NOT used yet.
- Tests 665 -> 714. Login work (Get started straight to Google, One Tap, G logo) was done in a
  separate session on branch `feat/google-one-tap` (a356a87), not merged here.

**Next:** collision audit into tailorCv; letters corpus from a private bucket; show "Why this
bullet" from `diff.editorial.decisions`; merge `feat/google-one-tap` once reviewed.

## 2026-11-11 - Sage Studio re-theme + Google Tag Manager

Parag found Heather "too plain". After comparing nine theme mock-ups (inspired by WTTJ, Teal,
LeetCode, FT, Linear and others), Parag picked **Sage Studio**.
- `app/globals.css`: new tokens. Oat canvas `--paper #F4F1EA`, cards `--card #FBF9F4` (`--surface`
  aliases it), sage `--accent #4F6F52`, plus a NEW fenced second colour `--warm` (terracotta
  `#C96A3F`, with `-text`/`-wash`) used only for progress. Stage scale is sage and turns warm at
  offer. Radius is now 6/16/24. Forest-ink dark twin. New `--room-*` tokens for the interview
  stage, which replace every hardcoded violet in `app/app/ui.module.css`.
- Warm is applied to: offer/negotiation stages, practised question dots, the speaking status dot,
  the landing page's second ambient glow, and the favicon's final dot. More "progress" places can adopt it.
- Fonts: Fraunces (display) + DM Sans (UI) replace Newsreader + IBM Plex Sans. Plex Mono stays.
- DESIGN.md §5 is rewritten to match, including the amended "one accent" rule (one accent plus
  one fenced progress colour). Stage chip contrast checked: lowest is 4.6:1.
- GTM: `app/layout.tsx` loads the standard GTM snippet + noscript iframe via `next/script`, only
  when `NEXT_PUBLIC_GTM_ID` is set (now in `.env` and `.env.example`). **Must also be set in Vercel**
  for production. Verified locally: the `gtm.js` event fires.

**Next:** engagement ideas not yet built: practice streak/heatmap, score ring in the interview
room, week-over-week deltas on the stat cards, a "Today" card, and collapsing empty pipeline columns.

## 2026-11-09 - Security scan + threat model (Devin)

Added `SECURITY_MODEL.md` at the repo root: trust boundaries, named components, entry points, assets,
attackers and the owner's risk decisions (open OAuth sign-up is intended; LLM keys are capped / free
tier so quota abuse is low impact; nothing out of scope). Security scans start from it, so update it
when a boundary, entry point or risk decision changes. No code or schema change.
- First scan found 3 low findings: no max input length / rate limit on AI server actions and
  `/api/jd`, and an unchecked `next` redirect in `app/auth/callback/route.ts`.

**Next:** the findings are optional hardening (cap prompt text length; validate `next` is a relative path).

## 2026-11-10 (late) - Delivery measured from your voice, in the page

Parag asked whether tone, modulation, breaks and fillers were analysed - they were not.
Step 1 (on-device, $0) is built; step 2 (ElevenLabs/other transcription that keeps "um"/"uh",
which sends audio out and costs credits) is NOT built and would need an opt-in.
- `lib/interview/voice.ts` (pure, 19 tests): `pitchHz` (YIN, 70-400Hz, ~1.5ms per 2048-sample
  frame), `summarizeVoice` (speech by adaptive RMS threshold; pauses >= 600ms inside the answer,
  longest pause, words/min over first-to-last word, median pitch, pitch SD in semitones),
  `combineVoice`, `hedgeCounts` (basically, sort of, kind of, you know, I guess, I mean,
  actually, literally, um/uh/erm when they survive; "like" deliberately not counted),
  `deliveryNotes` (fast > 175 wpm, slow < 115, flat < 2 semitones, choppy > 12 pauses/min,
  hesitation >= 3s, hedging >= 3), `voicePromptLine`, `parseVoiceSummary` (zod).
- `speech.ts` `openMicLevel(rms, pitch)` now also returns `sample()` (float RMS + pitch).
  `mock-interview.tsx` samples every 50ms while listening, summarises per answer, commits the
  summary only when the answer is accepted, and sends `combineVoice(...)` with the feedback
  request. Only numbers leave the page.
- `mockFeedbackAction` validates the summary, counts hedges from the transcript, adds the measured
  line to the debrief prompt (one delivery improvement at most, "never guess at tone"), and returns
  `voice` + `hedges`; the page shows a "Delivery - measured from your voice" section.
- Not stored: `interview_attempts` has no column for it (would need a migration).
- Untested end to end: needs a real microphone and the AI key (live site).

## 2026-11-10 (night) - Company questions instead of firm filter; quieter interview page

**Parag: behavioural questions should not be firm-specific; company questions should be "Why X?".**
- `lib/interview/company-questions.ts` (pure, 10 tests): `companyQuestions(apps, templates)` - one
  set per company with a live (not closed) application, newest activity first, applications to
  one company merged (newest role wins). Templates are DATA (`companyQuestions` in
  `data/interview/questions.json`: why / role / value, each with a `short` list label). `context`
  is only the JD extract's role, top skills, sector, location. `fit-why-firm` was removed from the
  bank (its advice moved into the "why" template); an old answer to it, if any, is orphaned.
- `app/app/interview/bank.ts`: `findQuestion(db, userId, id)` resolves bank or company questions;
  every action uses it (save answer, mock start/turn/feedback). The `firm` parameter is gone from
  the actions, the page and the application page's links. `scoreAnswerAction` and
  `practice-panel.tsx` were removed; `ScoreCard` lives in `score-card.tsx`.
- `MIN_FOLLOW_UPS` is now 0: "none (one answer)" is the quick practice mode.
- UI, from the review: stage-first (no card), Join on the stage, gear opens a settings strip
  (localStorage `jobsearch.mock-interview`), status dot, icon call bar along the stage foot with
  "Done answering" only when typing / not hands-free and there is text, End apart on the right;
  question list with status dots (empty / half = notes / full = practised), company names as
  sub-headings; "What good looks like", "Your notes", "Your attempts" are disclosures; the
  "What your CV already evidences" block became a chip on the guidance line; tabs reordered to
  Behavioural, Technical, Casing. Light mode gets a softer stage. The orb sits higher (`lift`)
  and shrinks on short stages (phones).
- Checked locally with the voice blocked (zero credits): desktop dark + light, phone, settings,
  join, typing. Real follow-ups still untested locally (no AI key here).

## 2026-11-10 (evening) - The mock interview becomes a meeting with an AI agent

Parag: the text thread did not feel like an interview; make it a meeting with an animated AI
agent (Three.js). `mock-interview.tsx` now has a lobby (agent idle, settings, "Join the
interview") and a room: stage with the agent, status ("Your turn", "Listening", "Thinking…",
"Speaking"), clock and follow-up count, live captions (the interviewer's words roll in step
with its audio; your words while you talk; its last line stays up otherwise), a "You" tile
with a mic meter, and meeting controls (Mute/Unmute, Done answering, Type instead, Captions,
Transcript, End and get feedback). Opens with a spoken "Hi, thanks for joining." when the voice
is on. Feedback appears under the stage at the end.
- `agent-avatar.tsx`: `three` (new dependency, loaded with `import("three")` only when the panel
  opens). Shader orb with simplex-noise displacement + particle ring; looks per state ease
  in; reads `getState`/`getLevel` per frame (no React re-render); stops off screen; falls back
  to a CSS orb without WebGL.
- `lib/interview/agent.ts` (pure, 14 tests): `agentState`, `rmsLevel`, `smoothLevel`, `captionWindow`.
- `speech.ts`: `primeAudio()` (call in the click), `speechActivity()` (speaking / level /
  progress; ElevenLabs audio goes through an AnalyserNode only if the AudioContext is running,
  browser voice uses word-boundary pulses), `onSpeakingChange`, `openMicLevel` (meter only, not
  routed anywhere).
- Checked locally with voice off and /api/tts blocked (zero credits): lobby, join, caption,
  typed answer, missing-AI-key message. Not yet seen with the live voice or the real follow-ups.

## 2026-11-10 (later) - Behavioural mock interview with follow-ups (same branch)

**Parag is done with MBB cases; behavioural is the focus now.** New panel "Mock interview" on
`/app/interview` (behavioural tab), above "Practise out loud": the interviewer asks, you answer,
it pushes back with follow-ups, and feedback comes only at the end.
- `lib/interview/mock.ts` (pure, 30 tests). CODE owns the path: `probeCandidates` finds gaps by
  rules (number said but not in the written answer > "we" over "I" > no number in anything said >
  latest answer < 30 words > no reflection words > `depth` as last resort), never repeats a probe,
  and `nextStep` closes at `maxFollowUps` (1-4, picked in the UI, default 3) or when nothing is left.
  The model only phrases the probe from the offered list (`parseFollowUp` forces a valid kind);
  `guardFollowUp` swaps any line stating a number nobody said for `FOLLOW_UP_FALLBACK`.
  Tone friendly / neutral / tough goes into the prompt.
- Actions: `startMockAction` (no model), `mockTurnAction` (small tier; model failure -> stock
  follow-up, rate limit -> retry), `mockFeedbackAction` (premium tier; six dimensions + a
  held/partial/weak verdict per follow-up; saved via `saveAttempt` so it joins "Your attempts").
  No schema change: the session lives in the page (zod-validated on every call) until feedback;
  a refresh mid-interview loses it.
- Hands-free: `speak()` now resolves when the line ends; the page then listens and sends after
  2.5s of silence (`SILENCE_MS`). Typing always works.
- Verified locally only up to the model call (no AI_GATEWAY_API_KEY on the laptop, and Parag
  asked to keep test credit use low). The follow-up and feedback model calls are untested live.

## 2026-11-10 - ElevenLabs voice for the interviewer (branch feat/elevenlabs-voice)

Spoken practice ("Ask me the question") and the case room now speak through ElevenLabs when the
server has it configured, else the browser voice as before. Text only goes to ElevenLabs; answers
are still transcribed by the browser and never reach ElevenLabs.
- `lib/adapters/elevenlabs.ts` (pure, 9 tests): `ttsConfigFromEnv` (null unless all five
  `ELEVENLABS_*` vars are set - no code defaults), `ttsRequest`, `ttsLedgerEntry` (characters
  logged to token_ledger as module `interview-tts`, model `elevenlabs/<model>`).
- `app/api/tts/route.ts`: 501 when unconfigured (client falls back and stops asking), 401 signed
  out, 400 empty/over `ELEVENLABS_MAX_CHARS`, 502 upstream failure; streams audio/mpeg back.
- `speech.ts`: `speak()` is now async and tries /api/tts first; `stopSpeaking()` replaces every
  direct `speechSynthesis.cancel()`. practice-panel no longer calls speechSynthesis itself.
- Verified locally: unconfigured -> 501 -> browser voice; with Parag's key the interview page
  plays ElevenLabs audio (200, audio/mpeg) and the browser voice stays silent. Voice is the
  premade "George" (`JBFqnCBsd6RMkjVDRZzb`) for now. The key is text-to-speech only, so it cannot
  list voices - copy IDs from the ElevenLabs Voices page (about 20 characters).

**Next:** add the five vars on Vercel and redeploy; swap the voice if Parag picks another. A case-room turn
longer than ELEVENLABS_MAX_CHARS falls back to the browser voice for that turn.

## 2026-10-29 - Interview prep on the application page (ROADMAP Now #2, shipped)

`/app/applications/[id]` has a new panel, "Interview prep for this application": for each competency
the JD implies (`inferCompetencies` via `prepSet`'s gap report) it shows **story ready** (the story's
Result), **CV line only** (the first line on this application's CV that evidences it, plus a count of
others), or **gap**, with a "practise" link to the first bank question with that competency
(`/app/interview?tab=behavioural&firm=all&q=<id>`) and a "question bank" link. A collapsed list
shows each CV line with its backing story (pinned or same-project), "needs a story", number
mismatches, and CV ids no longer in the bank. Rules only, zero tokens.
- New pure helper `lib/stories/prep-view.ts` `competencyPrep` (7 tests); exported from `lib/stories`.
- CV line text on the page now goes through one `shownText` (override > chosen variant > bank text).
- Process map step "Prep for this exact application" lost `coming` and is now `auto`.
- No schema change. `stakeholder-management` has no bank question, so it shows no practise link.

**Next:** no form writes `stories` yet, so live prep shows only "CV line only" or "gap". A story
capture form (`draftStory`/`saveStory`) is the natural follow-on; otherwise ROADMAP Now #1 / #3.

## 2026-09-25 (morning) - Sourcing filter in the app; hero card shows the whole loop

**Job filter (ROADMAP Now #1, first half - shipped).** `lib/watchlist/targets.ts` (tested): a role is
kept if its location contains a target city and its title contains a target phrase as WHOLE words,
and no excluded phrase ("intern" never hits "internal"). Empty lists filter nothing. Used by
`refreshWatchlist` (the in-app button, which had no filter and could flood the table) AND
`scripts/source-singapore.ts` (its hardcoded regexes are gone; it refuses to run with no targets).
- Data: profile columns `target_titles`, `excluded_titles` (migration **0003, applied live**;
  mirrored in schema.sql). Parag's phrases are DATA in `data/cvbuilder/archetypes.json`:
  `titleKeywords` per role family + top-level `excludedTitleKeywords`; the importer unions them.
- Editable on `/app/watchlist` ("What you are looking for": cities / titles to keep / to drop).
- Live: set the two columns directly (NOT `db:seed`, which would reset app-edited applications),
  ran the real refresh (153 matches), and dismissed the 9 saved roles that no longer match
  (designers, an intern role, product-ops specialists). 161 open. Engineering-manager roles now
  appear because that is one of Parag's five role families - he can drop it on the watchlist page.

**Hero card** now plays the whole loop: sourcing, networking, applying, interview, then Improve (loop
arc lights, ring returns to start), round two, offer. Each frame is tagged AI / automatic / soon. On
wrap the ring re-mounts and fades in instead of sliding back (the old glitch). H1 is now "From the
first search to the final offer."; the lede says negotiation is coming.

Tooling note: in this Bash tool, `\\n` inside a heredoc arrives as `\n` - use the Edit tool (or a
separate file) for code containing escape sequences.

**Next:** rest of ROADMAP Now #1 - daily cron + retire closed roles (several roles marked `new` are
already gone from their boards).
