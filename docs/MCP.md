# Agent access (MCP)

`POST /api/mcp` is a stateless MCP server (JSON-RPC, `lib/mcp/server.ts`). An agent calls it
with a personal token made on `/app/agent`. Tools live in `lib/mcp/tools.ts`, and the rules
they enforce in `lib/services/agent-sync.ts` and `lib/services/agent-prep.ts`.

**Rules every tool keeps:**
- Every read and write is filtered on the token's user.
- A `read` token sees only the read-only tools.
- Writes are idempotent on `externalRef`, so re-sending updates in place.
- Practice attempts and scores are never written by any tool.

## Pipeline
| Tool | What it does |
|---|---|
| `pipeline_summary` | Counts by stage, response rate, stale applications |
| `list_applications` / `get_application` | Applications, compact or one in full |
| `upsert_application` | Create or update one; never moves a stage |
| `set_stage` | Move a stage with a date and evidence; closing needs `confirmedByUser` |
| `role_insights` | What a line of work asks for, against your record |

## Network
| Tool | What it does |
|---|---|
| `list_contacts` / `get_contact` | Contacts; `get_contact` returns every field the Network page keeps (including `linkedinUrl`) and interactions **with their ids** |
| `upsert_contact` | Create or update; `null` clears a field (`nextFollowup: null` clears a stale follow-up) |
| `log_interaction` | Record one thing that happened; the same date, channel and summary is recorded once |
| `update_interaction` | *(2026-11-20)* Correct a logged interaction by contact + `interactionId` |
| `remove_interaction` | *(2026-11-20)* Remove one logged by mistake |

The Network page keeps nothing `get_contact` doesn't return: name, company, role, location,
warmth, status, how you know them (`network`), interests, next follow-up and LinkedIn link.

## Interview prep
| Tool | What it does |
|---|---|
| `upsert_interview_questions` / `remove_interview_questions` | One application's real interview round. In order: it is also the script of the app's full mock interview. Each question may carry `modelAnswer` and *(2026-11-20)* `rolePlay` |
| `list_interview_questions` | Those questions; `includeAnswers: true` also returns `lookFor`, `context` and the model answer text *(2026-11-20)* |
| `list_interview_practice` | Written answers and newest mock attempts per question; every kind of question now carries its text *(fixed 2026-11-20: bank questions came back `text: null`)*. Also each question's `rolePlay`, and `fullInterviews`: whole mock interviews with the path taken, per-topic verdicts, weakest moments and transcript *(2026-11-20)* |
| `set_role_play` | *(2026-11-20)* A sample interviewer-candidate exchange for any question. Candidate lines only from the model answer (a number not in it, or in the written answer, is refused); never over one the user built in the app unless `force` + `confirmedByUser` |
| `set_model_answer` | The model answer for any question; never overwrites the user's own unless `force` + `confirmedByUser` |
| `list_projects` | *(2026-11-20)* Projects with their CV points, to attach a story to |
| `list_stories` | *(2026-11-20)* STAR stories with `source` and `provenance`; filter by project, competency or `externalRef` |
| `upsert_story` | *(2026-11-20)* Store a story **the user told you**: `provenance` is required. Use `projectId` or `projectRef` (the CVbuilder role id), and optionally `bulletId` or `bulletRef`. Competencies come from the fixed vocabulary, or are read from the text when left out. Any number given must appear in the text. |
| `remove_story` | *(2026-11-20)* By `id` or `externalRef` |
| `get_application_prep` | *(2026-11-20)* Exactly the application page's "Interview prep for this job", from the same functions (`prepSet`, `competencyPrep`, `shownBulletText`) |
| `list_custom_questions` / `add_custom_question` / `remove_custom_question` | *(2026-11-20)* The user's own practice questions (`custom:<id>`), with optional competency and tag; idempotent on `externalRef`. Off when `INTERVIEW_CUSTOM_QUESTION_MAX_CHARS` is unset, as in the app. |

## Briefs
| Tool | What it does |
|---|---|
| `get_brief` | *(2026-11-20)* The saved brief for a date. For today with none saved, one is composed from the app's data without saving. |

There is no `save_brief`. A brief is derived from the app's own records (follow-ups due,
applications waiting, new roles), and regenerating it overwrites the day's row. A brief written
from outside would be silently replaced, and could list things no record backs.

## Stories are captured, never generated
`upsert_story` stores words the user gave and says so:
- `source` is `agent` and `provenance` is required. A database check (migration 0016) enforces both.
- Nothing in the app writes story text.
- Competencies and numbers are only read back out of the words.
- A number the agent lists must be in the story's own text.
