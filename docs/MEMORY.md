# Work log (newest first)

Keep this file updated at the end of every working session: what was done, decisions taken, what's next. CLAUDE.md holds the stable rules; this holds the moving state. Keep only the last two or three sessions here - move older entries to docs/MEMORY-archive.md so a fresh session stays cheap to start.

## 2026-11-25 - Fail closed without Supabase

Middleware and workspace resolution refuse requests without the Supabase URL and publishable key. To use the shared CVbuilder workspace locally without credentials, opt in with `LOCAL_DEMO_MODE=true npm run dev`. A production build can be made without credentials, but production requests cannot use the local demo. The fictional public demo still uses `DEMO_MAX_VISITORS` on configured deployments.

## 2026-11-25 - Browser test suite

Added Playwright coverage for every routed screen and the main cross-screen workflows in the isolated public demo. CI runs it on a production build; see [E2E.md](E2E.md) for the screen map, commands and live-service gaps. The transcript hide/reopen regression is an explicit expected failure; the reload and eval export still verify ratings are saved.

## 2026-11-23 - Interviewer ratings + eval set (branch feat/interviewer-ratings-eval)

Parag wants to explore fine-tuning the interviewer; agreed order: collect labels, build a fixed eval, then few-shot, then (only if needed) distil into a fine-tuned fast model. Built steps 1-2: **Good / Bad + "what it should have asked"** on each interviewer line in a finished full interview's transcript (migration **0019** `interviewer_ratings`, applied by db.yml on merge), **Download the eval set** (`/api/interview-eval`), and `npm run interview:eval` (rules free; `--live` replays through the interviewer in `.env.local`; `--judge` needs `EVAL_JUDGE_MODEL`). `fullTurnAction` now runs `chooseFullReply`, shared with the eval. Checked in the local demo (rate, better line, reopen report, download). **Not run: `--live` / `--judge`** (no gateway key locally; billed). Next: Parag rates a few interviews, then a live baseline on Gemini 3.8 Flash, then few-shot.

## 2026-11-22 (later) - Settings page (same branch, fix/interviewer-loops)

Parag has the free $5 AI Gateway credit and wanted the best model for it, and every setting (models, interviews, the rest) on one page. Built `/app/settings` (nav, last): registry-driven (`lib/settings/registry.ts`), saved in `user_settings` (migration **0018**, applied by db.yml on push to main), read through `envFor`; all model/interview/pipeline/goal/CV reads now go through it. Model pickers show price, ~cost per interview and "on your plan / needs credits" from the gateway's `include_availability` (key stays server-side); "Use the best for my plan" picks per job from `data/settings/model-preferences.json`. Interviewer: **Gemini 3.8 Flash** by Parag's choice (top of the interviewer preferences; Vercel `AI_GATEWAY_INTERVIEWER_MODEL=google/gemini-3.8-flash`, `_EFFORT=low`, `_MAX_TOKENS=2000` once merged). Checked in the local demo (pickers, use best, save + reload, refused combination). **Not checked: the live plan marks** (needs the real key; the page shows "could not ask" if that call fails).
