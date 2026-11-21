# Full interview and role-plays (design and as built, 2026-11-20)

**Decided with Parag:** code lists the moves and the model picks (below); MCP gets read-back and
agent role-plays; the interviewer has its own model setting. Then, mid-build, he asked for a
simpler page ("I'm preparing for this company... if it's BCG it's casing or behavioural; a
technical company is very different") that still works with no interview coming up - section 3
was rewritten to the company-first page that shipped.

Parag's ask: company practice feels generic. He wants (1) **one comprehensive mock interview per
company/role** that runs like a real interviewer there (e.g. Cognition's Deployed Engineer round),
adapting to his answers and ending in one debrief, and (2) **every question still practisable on its
own**, each with a **role-play**: a sample interviewer–candidate exchange showing how the question
and a strong answer (from the model answer) play out, likely follow-ups included.

## What already exists (and is reused)

- **Role questions** (`interview_role_questions`, 0012): one application's real round, pushed over
  MCP in order, with `round`, `interviewer`, per-question `competency`, `lookFor`, `context`
  (the "Interview brief") and `source`. Cognition's DE round has 12, all with model answers
  (`interview_model_answers`, 0013). This ordered set **is** the interview script.
- **Single-question mock** (`lib/interview/mock.ts`): code finds weaknesses by rules
  (`probeCandidates`: numbers, ownership, result, specificity, reflection, depth) and decides
  probe/close; the model only phrases the probe; `guardFollowUp` replaces a line with an invented
  number. Debrief compares against the model answer, plus fillers, voice and number drift.
- **Case interviewer** (`case-session.ts` / `case-method.ts`): code owns the path, the model talks,
  `guardReply` stops invented figures; saved every turn in `case_sessions`.
- **The room** (`mock-interview.tsx`): avatar, ElevenLabs/browser voice (`speak`/`stopSpeaking`),
  hands-free mic, captions, delivery metrics, debrief layout.

## 1. Full interview

### How branching is decided: code owns the graph, the model chooses within it

Same split as the case interviewer. Each turn:

1. **Code computes the legal moves** from the plan, the budgets and rule signals:
   - `probe:<kind>` — a weakness rules found in this topic's answers (reuses `probeCandidates`).
   - `deepen` — the answer was solid; ask one level deeper ("why that design", "what was the
     alternative", "what broke") — the why-chain Cognition's DE said the round tests.
   - `next:<topicId>` — move on. Code offers **the next two unasked topics** (so the model can
     follow the conversation: if he just talked about recovery, "failure-recovery" comes next),
     never the closing topic until it is the last one left.
   - `close` — only when the agenda is done or the turn budget is spent.
   Per-topic follow-up cap and total turn budget come from env. When a cap is hit the only legal
   move is `next`/`close` — the model cannot keep drilling.
2. **The model (interviewer tier)** reads the plan, the brief, the model answer for the current
   topic (as a private yardstick, never quoted) and the recent transcript, and returns JSON:
   `{"move":"deepen","say":"...","assessment":"strong|adequate|weak","note":"one line, private"}`.
   It picks **which** legal move — that is the judgement a stronger model is worth paying for:
   noticing a hand-wave, or that a strong answer deserves one more "why".
3. **Guards** (code): a move not in the legal set becomes code's first choice; a `next` line must
   end with the planned question (a short bridge before it is allowed, so the topic id and the
   question stay tied); `guardFollowUp`'s rule rejects any number the candidate never said; a
   failed or slow model call falls back to the stock line for code's first choice. The interview
   never stalls.

The private `assessment`/`note` per turn is stored on the turn and fed to the debrief, so the
debrief knows *why* the interviewer went where it did.

### The plan

`lib/interview/full-plan.ts` (pure): an application's plan =

- **With role questions** (the realistic case): the round's questions in pushed order, each a
  topic with its `kind`, derived by rules: first = `opener`, a "questions for us" topic = `close`
  (kept last), everything else `topic`. Interviewer persona = the round's `interviewer`; brief =
  each topic's `context`.
- **Without role questions**: the three "Why <company>?" templates plus the bank questions whose
  competency the job's extract calls for, capped. Labelled honestly in the UI: "Built from the job
  description. Ask your agent to push this round's questions for a realistic interview."

Plan length is capped by env (`INTERVIEW_FULL_MAX_TOPICS`); with 12 Cognition topics and a cap of,
say, 8, code keeps opener + close and the first topics in order, and the model's `next` choice
decides which of the rest get asked in time — like a real 45-minute round that never covers
everything.

### Debrief (one, for the whole interview)

One premium call over the whole transcript (`buildFullDebriefPrompt`): overall scores on the
existing `SCORE_DIMENSIONS`, **per topic** a verdict and one-line note, **the three weakest
moments** quoting what he said and what a stronger answer would sound like (built from that
topic's model answer — content may come only from the model answer or what he said, the same
honesty rule as the rewrite), number drift against all model answers, fillers and voice metrics
(existing code). The path taken (which topics, which probes/deepens) is shown as a timeline.

### Data model — migration `0017_full_interviews.sql`

`interview_full_sessions`: `id`, `user_id`, `application_id`, `plan jsonb` (snapshot, so a later
re-push does not rewrite history), `session jsonb` (turns with topic id, move, assessment),
`status running|done`, `scores jsonb`, `overall numeric`, `per_topic jsonb`, `moments jsonb`,
`strengths`, `improvements`, `model`, timestamps. RLS "own rows". Saved every turn like
`case_sessions`, so a refresh or a dropped connection does not lose a 40-minute interview.

### Model tiers and the ledger

- Interviewer turns: new env `AI_GATEWAY_INTERVIEWER_MODEL` (a stronger model than the small
  tier, since choosing the branch is judgement); unset = the premium model.
- Debrief and role-plays: `AI_GATEWAY_PREMIUM_MODEL`.
- Every call through `aiWrite`; new `CANNED_TASKS`: `full-turn`, `full-debrief`, `role-play`
  (canned replies follow code's first legal move, so the demo still branches). Each call logged
  (`interview-full-turn`, `interview-full-debrief`, `interview-role-play`).

## 2. Per-question role-play

On each question (role, company, bank or custom), under the model answer: **Role-play**.

- One premium call (`buildRolePlayPrompt`): the interviewer persona and brief, the question, its
  rubric, and the model answer. It returns 6–10 lines: the question, a spoken strong answer
  (condensed from the model answer), two or three likely follow-ups chosen from the same probe /
  deepen moves the live interviewer uses, a strong reply to each, and for each candidate line a
  one-line "why this works".
- **Guard** (`guardRolePlay`): a candidate line may only state numbers that are in the model answer
  (or written answer); otherwise the play is refused with a reason, like `guardRewrite`. No model
  answer = the button says "Write or rewrite a model answer first".
- Stored in `interview_role_plays` (same migration): one per user + question, with the hash of the
  model answer it was built from, so the page says "Built from an older model answer — rebuild"
  when the answer changes. Cached: viewing costs nothing after the first build.
- Shown as a chat transcript; **Play** reads it aloud — the interviewer in the interviewer's voice
  (`speak`), the candidate in the browser's second voice — so he can hear how a strong answer
  paces.

## 3. UI (as built: company first)

- A **"Preparing for" strip** leads the Interview tab: **Practice** (always there) and one card
  per company you're applying to. The company decides the interview: a round an agent pushed
  (`kind: round`), a consulting firm by the bank's firm names or a consulting role family
  (`consulting`: fit questions plus the case room on the same page), or one built from the job ad
  (`job`). `lib/interview/prep.ts`. Opens on the next pushed round, else Practice.
- **A company's page:** the Full mock interview card, then that company's questions grouped by
  competency, each with model answer, role-play and the single-question mock.
- **Practice:** Questions / Technical / Cases. Questions leads with a **general full interview**
  (`planFromBank`: "Tell me about yourself", then one question per bank group, groups never
  practised first, then the weakest), stored with `application_id` null.
- **The room** is a separate component (`full-interview.tsx`) reusing the avatar, speech,
  voice metrics and ScoreCard, not a refactor of `mock-interview.tsx` (lower risk to the working
  single-question mock; the two share their parts, not their state machine).
- Role-plays play aloud with `speak(text, lang, rate, "candidate")`: the candidate's lines use a
  second browser voice, never ElevenLabs.

## 4. MCP (built)

- `list_interview_practice` returns `fullInterviews` (path, per-topic verdicts, moments,
  transcript) and each question's `rolePlay` (with `stale`).
- `upsert_interview_questions` takes an optional `rolePlay` per question; `set_role_play` sets
  one for any question. Both go through `saveAgentRolePlay`: the same number guard as an
  app-built play, against the current model answer; never over an app-built one unless `force`
  + `confirmedByUser`. A refused play is reported per question, the rest of the set still saves.

## Token ledger

Every call is logged (`interview-full-turn`, `interview-full-debrief`, `interview-role-play`).
The gateway's streaming endpoint reports no usage, so these rows carry an **estimate** (about four
characters a token, `estimateTokens`); the older interview calls still log zeros. The demo logs
zero with model "demo". A turn with only one legal move makes no call at all.

## Realism fixes (2026-11-21, branch fix/interviewer-realism)

Two full mocks on 20 Nov showed the interviewer leaking a fact from the private model answer
("You mentioned the files-migration feature was stuck for two years"), one answer recorded twice,
and an answer cut off mid-sentence. What changed:

- **The model answer is out of the turn prompt** (`buildFullTurnPrompt` no longer accepts it). It
  stays the debrief's yardstick only. Being told to keep it secret did not stop the model quoting it.
- **Grounding guard** (`lib/interview/grounding.ts`, used by `guardFullReply` and the single mock's
  `guardFollowUp`). A follow-up may only use what the candidate said in this interview, plus the
  questions asked. That covers numbers in digits or words, names, quoted spans, and "you said /
  you mentioned ..." claims. The written notes are out of scope too. A line that fails the check,
  or can't be cut to one question of at most 25 words, is replaced by `echoProbe`: the candidate's
  own last words plus a short question.
- **Prompt** asks for one question of at most 25 words with no preamble, and for the interviewer
  to chase the weakest thing said. It now carries 6 recent turns, down from 8; the reply is capped at
  160 tokens, down from 300.
- **Double submit**: the client clears its answer before any `await` and drops results from a
  stopped recognition. The server's `turnConflict` rejects a stale turn count or a word-for-word
  repeat of the last answer.
- **Turn-taking** (`lib/interview/turn-taking.ts`, env `INTERVIEW_TURN_*`). The silence that ends an
  answer depends on whether it sounds finished: an answer ending on "as" or "and", or one still
  short, gets the long wait. The mic must be quiet too. A ramble is cut in on at a finished phrase.
  Unset env means hands-free waits for "Done answering".
- **Speed**: ElevenLabs audio plays as it streams in (Media Source Extensions); before, the client
  downloaded the whole clip first. Each turn logs `[full-turn]` on the server and
  `[interview-latency]` in the browser (wait / server / voice).
- **Past reports**: the lobby lists every finished interview (`FullInterviewCard.history`), and each
  opens its debrief. Single-question attempts open into their full report and transcript.

## Pause and Discard (2026-11-21, branch feat/interview-pause-discard)

Both rooms (full interview and single-question mock) have **Pause** right next to **Discard** on
the call bar.
- **Pause** stops the mic, the voice, the hands-free end-of-turn timer and the clock, and keeps
  what you had said so far. A reply that arrives while paused, or a line cut off by the pause, is
  said again on Resume.
- **Discard** in the full interview asks once, then deletes the running interview
  (`discardFullAction` → `discardFullSession`, which removes only a running session of that user).
  It never shows as a report, and the lobby no longer offers to resume it. A finished interview is
  never deleted this way.

## Known limits / next

- Number rules see digits only, so "nine days to four" reads as no result and gets probed.
- A consulting firm's full interview is fit only; a fit-then-case interview is the next step.
- A round's "questions for us" topic ends the call with a stock line: the interviewer never
  answers questions about the company (it would have to invent facts).

## Build order (TDD throughout)

1. `full-plan.ts`, `full-session.ts` (moves, budgets, guards, parse/validate) + tests.
2. `role-play.ts` (prompt, parse, guard) + tests; canned tasks + ai-write test.
3. Migration 0017 + schema.sql + repos (+ FakeDb) + tests.
4. Server actions; room refactor to a driver; full-interview UI; role-play panel.
5. Demo data (a role interview for the fictional person), browser check, DESIGN.md, MCP.md, MEMORY.md.
