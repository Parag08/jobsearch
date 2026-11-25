# Browser end-to-end tests

From the repo root with Node.js 22:

```sh
npm ci
npx playwright install chromium       # on a fresh Linux runner: add --with-deps
npm run test:e2e
npx playwright show-report
```

Playwright builds and starts Next.js at `localhost:3100`; stop other Next.js processes in the same checkout first because they share the build directory. The suite enters through `/demo`, not the shared local sample workspace. Each test has a fresh browser context and a separate copy of Maya's fictional data. Tests drive the real UI, Next.js server actions and downloads, with the app's in-memory demo database and built-in deterministic AI replies. The test server uses placeholder Supabase settings to satisfy the production configuration guard; no external service credentials are needed.

Run a file or filter by behavior with `npm run test:e2e -- e2e/interview.spec.ts` or `npm run test:e2e -- -g "Watchlist"`; add `--headed` to see Chromium. CI uploads the HTML report, including screenshots, videos and traces for unexpected failures. The known transcript regression also attaches its screenshot. Add tests by following the screen's primary action through to a visible result, and check reload or a connected screen for persisted writes. Do not share a demo session or make tests depend on execution order.

## Screen map

| Screen | What it is for | Browser check |
|---|---|---|
| Landing `/` | Explain JobSearch and offer entry to sign-in or the demo | Verify the Google sign-in button; enter and leave the demo, then verify its session is cleared. |
| Sign-in `/signin` | Start a personal workspace through Google | Check that the Google sign-in button is enabled without starting OAuth. |
| Architecture `/architecture` | Explore how the app's layers and workflows fit together | Select Tailor the CV, advance its step, and return to the whole system. |
| Not found | Recover from an invalid link or missing record | Follow the recovery links from an unknown route and a missing application. |
| Overview `/app/home` | See priorities, progress, streaks and market evidence | Switch Progress and Insights, then follow the Pipeline shortcut. |
| Pipeline `/app` | Track jobs by stage | Paste a job; verify its stage and that closed and applied jobs land in the right groups. |
| Application `/app/applications/[id]` | Manage pipeline records and prepare safe kits for picked roles | Save a next step and close a record; download PII-free content, request a letter or a limited portal answer, confirm manual submission with reviewed or different materials, and verify a frozen version survives closing. |
| Today `/app/watchlist` | Rank and triage sourced roles | Persist and reverse Pick, Later and Dismiss; change the daily maximum and prepare a kit only after picking. |
| Companies `/app/companies` and `/app/companies/[id]` | Manage targets, job boards and shared public research | Validate target details, remove and restore a target, replace a board, and explicitly request research. |
| Company list import `/app/companies/import` | Map and review CSV or XLSX rows before adding targets | Fix or skip CSV rows, map a visible XLSX worksheet on mobile, recover from a stale review without a partial write, and undo only the imported targets. |
| Network `/app/network` | Manage contacts, conversations and follow-ups | Add a contact, log a conversation, verify the follow-up and history, and check visitor isolation. |
| Role insights `/app?view=insights` | Find recurring requirements and compare them with existing evidence | Filter by role title, check the filtered evidence summary, and clear the filter. |
| Experience `/app/bank` | Maintain the evidence bank used for CVs and interviews | Add, edit, reload and delete a quantified point. |
| Interview `/app/interview` | Prepare for a company, practise questions and cases, and review feedback | Switch company and practice views; save notes, rehearse a custom question, open Technical, finish a case and a full mock, reopen reports, and download ratings. |
| Assistant `/app/agent` | Explain the MCP connection and manage access keys | Open setup details and verify key creation is unavailable in the demo. |
| Settings `/app/settings` | Set preferences for the job search workspace | Change a Pipeline preference and check it after a reload. |
| Sourcing preferences `/app/settings/sourcing` | Set the daily shortlist recipe and verify safe claims | Lower the daily maximum and verify the number of ranked roles on Today. |
| Mobile workspace navigation | Reach the same screens on small displays | Open the menu, navigate, and dismiss the menu with Escape. |

## Limits

The suite does not exercise live Google OAuth, Supabase persistence or RLS, authenticated MCP key lifecycle, actual job-board refresh, live AI providers, or microphone/audio. Those need a separate test workspace and credentials; never test writes against the owner's workspace. Chromium covers desktop and an emulated phone viewport, not other browser engines. The architecture test drives the controls, not WebGL rendering fidelity.

[Known transcript regression](https://github.com/Parag08/jobsearch/pull/32): hiding and reopening a finished full-mock transcript resets the visible rating even though the backend persisted it. Only that assertion is marked as expected to fail. The separate download and report re-open test still checks persistence. Remove the expected-failure annotation when the regression is fixed.
