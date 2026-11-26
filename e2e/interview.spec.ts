import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { appLink, expect, test } from "./demo";

async function openPractice(page: Page) {
  await appLink(page, "Interview").click();
  await expect(page.getByRole("heading", { name: "Interview prep" })).toBeVisible();
  const preparation = page.getByRole("navigation", { name: "Preparing for" });
  await preparation.getByRole("link", { name: "Practice", exact: true }).click();
  return page.getByRole("navigation", { name: "Practice", exact: true });
}

test("Interview prep switches company, question and technical views and keeps written notes", async ({ demo: page }) => {
  const tabs = await openPractice(page);
  const preparation = page.getByRole("navigation", { name: "Preparing for" });
  await preparation.getByRole("link", { name: /Kestrel AI/ }).click();
  await expect(page.getByRole("heading", { name: /Kestrel AI/ })).toBeVisible();
  await preparation.getByRole("link", { name: "Practice", exact: true }).click();
  await tabs.getByRole("link", { name: "Questions" }).click();
  const questions = page.getByRole("complementary", { name: "Questions" }).getByRole("link").filter({ has: page.locator("span[title]") });
  const first = questions.nth(0);
  const second = questions.nth(1);
  await first.click();
  const answer = page.getByRole("textbox", { name: "Your answer", exact: true });
  const notes = "I tested a guided rollout with 12 customers and reviewed activation weekly.";
  await answer.fill(notes);
  await page.getByRole("button", { name: "Save answer" }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  await second.click();
  await expect(answer).not.toHaveValue(notes);
  await first.click();
  await page.reload();
  await expect(answer).toHaveValue(notes);

  await tabs.getByRole("link", { name: "Technical" }).click();
  await expect(page.getByRole("heading", { name: "Technical" })).toBeVisible();
  await expect(page.getByText("Backed by your experience", { exact: true })).toBeVisible();
});

test("Cases opens a case, accepts a typed answer, and saves the scored debrief", async ({ demo: page }) => {
  const tabs = await openPractice(page);
  await tabs.getByRole("link", { name: "Cases" }).click();
  await page.getByRole("link", { name: /Ledgerline: which software company to buy/ }).click();
  await expect(page.getByRole("heading", { name: /Ledgerline: which software company to buy/ })).toBeVisible();
  await page.getByRole("checkbox", { name: "Interviewer speaks" }).uncheck();
  await page.getByRole("button", { name: "Start the interview" }).click();
  const answer = "I would compare retention, margins and integration costs before recommending a target.";
  await page.getByRole("textbox", { name: "Your answer" }).fill(answer);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const interview = page.getByRole("region", { name: "Interview", exact: true });
  await expect(interview.getByText(answer, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop and get feedback" }).click();
  const score = interview.getByRole("heading", { name: /\d\.\d\s*\/ 5/ });
  await expect(score).toBeVisible();
  await page.reload();
  await expect(score).toBeVisible();
  await expect(interview.getByText(answer, { exact: true })).toBeVisible();
});

test("a custom question can be rehearsed in a single-question mock", async ({ demo: page }) => {
  await openPractice(page);
  await page.getByRole("link", { name: "Your own", exact: true }).click();
  const question = "How did you decide which customers to invite to the pilot?";
  await page.getByRole("textbox", { name: "Your own question" }).fill(question);
  await page.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByRole("heading", { name: question })).toBeVisible();

  await page.getByRole("button", { name: "Interview settings" }).click();
  await page.getByRole("checkbox", { name: "Interviewer speaks" }).uncheck();
  await page.getByRole("combobox", { name: "Most follow-up questions" }).selectOption("0");
  const handsFree = page.getByRole("checkbox", { name: "Hands-free" });
  if (await handsFree.isVisible()) await handsFree.uncheck();
  await page.getByRole("button", { name: "Join interview" }).click();
  await page.getByRole("button", { name: "Type instead" }).click();
  const answer = "I invited five frequent users and five new customers so both perspectives were represented. Each group tested the same tasks and described where they got stuck.";
  await page.getByPlaceholder("Type your answer. Ctrl+Enter to send.").fill(answer);
  await page.getByRole("button", { name: "Done answering" }).click();
  await expect(page.getByRole("heading", { name: /\d\.\d\s*\/ 5/ })).toBeVisible();
  await page.reload();
  await page.getByText(/^Your attempts/).click();
  await page.locator("summary").filter({ hasText: `Interviewer: ${question}` }).click();
  await expect(page.getByText(`You: ${answer}`)).toBeVisible();
});

const betterQuestion = "How did you know the rollout actually helped customers?";

async function rateInterview(page: Page) {
  await openPractice(page);
  await page.getByRole("link", { name: "Open full interview" }).click();
  await page.getByRole("checkbox", { name: "Interviewer speaks" }).uncheck();
  const handsFree = page.getByRole("checkbox", { name: "Hands-free" });
  if (await handsFree.isVisible()) await handsFree.uncheck();
  await page.getByRole("button", { name: "Start full interview" }).click();
  await page.getByRole("button", { name: "Type", exact: true }).click();
  const answer = "I interviewed 12 customers to understand where setup broke down. Then I piloted a simpler flow and measured whether more customers finished setup each week.";
  await page.getByRole("textbox", { name: "Your answer" }).fill(answer);
  await page.getByRole("button", { name: "Done answering" }).click();
  await page.getByRole("button", { name: "Read transcript" }).click();
  const transcript = page.getByRole("list", { name: "Transcript" });
  await expect(transcript.getByText(answer, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "End and debrief" }).click();
  await expect(page.getByRole("heading", { name: /\d\.\d\s*\/ 5/ })).toBeVisible();
  const row = transcript.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Bad question" }) }).first();
  const bad = row.getByRole("button", { name: "Bad question" });
  await bad.click();
  await expect(row.getByRole("status")).toHaveText("Saved");
  const better = row.getByRole("textbox", { name: "What the interviewer should have asked instead" });
  await better.fill(betterQuestion);
  // Wait for this specific mutation, not the visible "Saved" from rating the line.
  const save = page.waitForResponse((r) => r.request().method() === "POST" && r.url() === page.url());
  await better.press("Enter");
  expect((await save).ok()).toBe(true);
  await expect(row.getByRole("status")).toHaveText("Saved");
  await expect(bad).toHaveAttribute("aria-pressed", "true");
  await expect(better).toHaveValue(betterQuestion);
  return { bad, better };
}

test("full mock interview scores a typed round and persists feedback and an eval download", async ({ demo: page }) => {
  test.setTimeout(60_000);
  const { bad, better } = await rateInterview(page);
  const event = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download the eval set" }).click();
  const download = await event;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const evalSet = await readFile(await download.path(), "utf8");
  expect(() => JSON.parse(evalSet)).not.toThrow();
  expect(evalSet).toContain(betterQuestion);

  await page.reload();
  await page.getByRole("button", { name: "Open report" }).click();
  await page.getByRole("button", { name: "Read transcript" }).click();
  await expect(bad).toHaveAttribute("aria-pressed", "true");
  await expect(better).toHaveValue(betterQuestion);
});

test("a saved rating stays visible when hiding and reopening the same transcript", async ({ demo: page }, testInfo) => {
  test.setTimeout(60_000);
  const { bad, better } = await rateInterview(page);
  await page.getByRole("button", { name: "Hide transcript" }).click();
  await page.getByRole("button", { name: "Read transcript" }).click();
  await expect(bad).toBeVisible();
  test.fail(true, "Known stale-ratings regression: https://github.com/Parag08/jobsearch/pull/32");
  try {
    await expect(bad).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
    await expect(better).toHaveValue(betterQuestion);
  } catch (error) {
    await testInfo.attach("rating missing after reopening", { body: await page.screenshot(), contentType: "image/png" });
    throw error;
  }
});
