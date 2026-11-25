import { readFile } from "node:fs/promises";
import { appLink, expect, test } from "./demo";

test("Pipeline reads a pasted role, saves the next step, and records a closure", async ({ demo: page }) => {
  await appLink(page, "Pipeline").click();
  const add = page.getByRole("button", { name: "Add a job", exact: true }).and(page.locator("[aria-controls]"));
  await add.click();
  const posting = page.getByRole("textbox", { name: "Job posting" });
  await expect(posting).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(add).toHaveAttribute("aria-expanded", "false");
  await add.click();
  await posting.fill("Product Operations Lead\nCompany: Example Labs\nOwn the roadmap and measure product adoption with customer research in Singapore.");
  await page.getByRole("button", { name: "Add to pipeline" }).click();

  await expect(page).toHaveURL(/\/app\/applications\/[^/?]+$/);
  await expect(page.getByRole("heading", { name: "Example Labs" })).toBeVisible();
  const stage = page.getByRole("region", { name: "Stage" });
  await expect(stage.locator('[aria-current="step"]')).toHaveText("Saved");

  const step = stage.getByRole("textbox", { name: "Next step" });
  const updated = page.waitForResponse((r) => r.request().method() === "POST" && r.url() === page.url());
  await step.fill("Ask about the product analytics team");
  await stage.getByRole("button", { name: "Save", exact: true }).click();
  expect((await updated).ok()).toBe(true);
  await page.reload();
  await expect(step).toHaveValue("Ask about the product analytics team");

  await stage.getByText("Close application…").click();
  await stage.getByRole("button", { name: "They said no" }).click();
  await expect(stage.getByText("Closed: they said no.", { exact: false })).toBeVisible();
  await appLink(page, "Pipeline").click();
  await page.getByText(/^[0-9]+ closed$/).click();
  await expect(page.getByRole("link", { name: /Product Operations Lead Example Labs/ })).toBeVisible();
});

test("Watchlist role becomes an application, exports its CV, and freezes the sent documents", async ({ demo: page }) => {
  await appLink(page, "Watchlist").click();
  await page.getByRole("button", { name: "Apply to Product Manager, Growth at Orchard Commerce" }).click();
  await expect(page.getByRole("heading", { name: "Orchard Commerce", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("the posting is read and your CV is built");
  await expect(appLink(page, "Pipeline")).toHaveAttribute("aria-current", "page");

  const cv = page.getByRole("region", { name: "CV", exact: true });
  const downloadEvent = page.waitForEvent("download");
  await cv.getByRole("link", { name: "Download PDF" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  const pdf = await readFile(await download.path());
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");

  const letter = page.getByRole("region", { name: "Cover letter" });
  await letter.getByRole("textbox", { name: /What caught your eye/ }).fill("I saw the team share its checkout research with small retailers at a local meetup.");
  await letter.getByRole("button", { name: "Write cover letter" }).click();
  await expect(letter.getByRole("textbox", { name: /The letter/ })).not.toHaveValue("");

  await page.getByRole("button", { name: "Mark as applied" }).click();
  await expect(page.getByRole("region", { name: "Stage" }).locator('[aria-current="step"]')).toHaveText("Applied");
  await expect(cv.getByText(/This is exactly what you sent/)).toBeVisible();
  await expect(cv.getByRole("button", { name: "Rebuild CV" })).toHaveCount(0);
  await expect(letter.getByRole("button", { name: "Save edits" })).toHaveCount(0);

  await appLink(page, "Pipeline").click();
  await expect(page.getByRole("region", { name: "Applied", exact: true }).getByRole("link", { name: /Product Manager, Growth Orchard Commerce/ })).toBeVisible();
});

test("a missing application offers a pipeline recovery link", async ({ demo: page }) => {
  await page.goto("/app/applications/00000000-0000-0000-0000-000000000001");
  await expect(page.getByRole("heading", { name: "That page does not exist." })).toBeVisible();
  await page.getByRole("link", { name: "Go to your pipeline" }).click();
  await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
});
