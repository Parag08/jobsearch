# Work log (newest first)

Keep this file updated at the end of every working session: what was done, decisions taken, what's next. CLAUDE.md holds the stable rules; this holds the moving state. Keep only the last two or three sessions here - move older entries to docs/MEMORY-archive.md so a fresh session stays cheap to start.

## 2026-11-25 - Fail closed without Supabase

Middleware and workspace resolution refuse requests without the Supabase URL and publishable key. To use the shared CVbuilder workspace locally without credentials, opt in with `LOCAL_DEMO_MODE=true npm run dev`. A production build can be made without credentials, but production requests cannot use the local demo. The fictional public demo still uses `DEMO_MAX_VISITORS` on configured deployments.

## 2026-11-25 - Zod 4 security upgrade

Pinned Zod to 4.6.7 for [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). Custom validation messages stay the same. Interview parsers skip incomplete feedback and role-play entries, keeping usable model output.

## 2026-11-25 - Browser test suite

Added Playwright coverage for every routed screen and the main cross-screen workflows in the isolated public demo. CI runs it on a production build; see [E2E.md](E2E.md) for the screen map, commands and live-service gaps. The transcript hide/reopen regression is an explicit expected failure; the reload and eval export still verify ratings are saved.

## 2026-11-25 - Next.js security patch

Pinned Next.js to 15.5.29 for the image optimization and Server Actions advisories. Rebasing preserved main's PostCSS, source-map-js, and sharp overrides. Zod remains a separate follow-up.

## 2026-11-23 - Interviewer ratings + eval set (branch feat/interviewer-ratings-eval)

Parag wants to explore fine-tuning the interviewer; agreed order: collect labels, build a fixed eval, then few-shot, then (only if needed) distil into a fine-tuned fast model. Built steps 1-2: **Good / Bad + "what it should have asked"** on each interviewer line in a finished full interview's transcript (migration **0019** `interviewer_ratings`, applied by db.yml on merge), **Download the eval set** (`/api/interview-eval`), and `npm run interview:eval` (rules free; `--live` replays through the interviewer in `.env.local`; `--judge` needs `EVAL_JUDGE_MODEL`). `fullTurnAction` now runs `chooseFullReply`, shared with the eval. Checked in the local demo (rate, better line, reopen report, download). **Not run: `--live` / `--judge`** (no gateway key locally; billed). Next: Parag rates a few interviews, then a live baseline on Gemini 3.8 Flash, then few-shot.
