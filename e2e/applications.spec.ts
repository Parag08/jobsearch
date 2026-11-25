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

test("a picked role becomes a safe kit and only confirmation moves it to Applied", async ({ demo: page }, testInfo) => {
  await appLink(page, "Watchlist").click();
  await page.getByRole("button", { name: "Pick Product Manager, Growth", exact: true }).click();
  await expect(page.getByText("1 role picked")).toBeVisible();
  await expect(page.getByRole("link", { name: "Product Manager, Growth · Orchard Commerce" })).toHaveCount(0);
  await page.getByRole("button", { name: "Prepare 1 kit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Product Manager, Growth", exact: true })).toBeVisible();
  await expect(page.getByText("Application kit · saved")).toBeVisible();
  await expect(page.getByText("Not requested", { exact: true })).toHaveCount(2);
  await testInfo.attach("Saved application kit", { body: await page.screenshot({ path: testInfo.outputPath("saved-kit.png") }), contentType: "image/png" });
  await expect(appLink(page, "Pipeline")).toHaveAttribute("aria-current", "page");

  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PII-free content" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("safe-cv-content.txt");
  const content = await readFile(await download.path(), "utf8");
  expect(content).toMatch(/Conducted|Coordinated|Defined/);
  expect(content).not.toMatch(/Maya|@|Orchard Commerce/);
  await expect(page.getByText("Application kit · saved")).toBeVisible();

  await page.getByRole("button", { name: "Ask my Claude for a letter" }).click();
  await expect(page.getByRole("button", { name: "Copy Claude request" })).toBeVisible();
  await page.getByRole("checkbox", { name: "I reviewed the exact safe CV content shown above." }).check();
  await page.getByRole("button", { name: "Save CV review" }).click();
  await expect(page.getByText("Reviewed", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "I submitted this application" }).click();
  const confirm = page.getByRole("dialog", { name: "Confirm actual submission" });
  await expect(confirm.getByRole("radio", { name: /Reviewed PII-free content/ })).not.toBeChecked();
  await confirm.getByLabel("Submission date").fill(new Date().toISOString().slice(0, 10));
  await confirm.getByRole("radio", { name: /Reviewed PII-free content/ }).check();
  await confirm.getByRole("checkbox", { name: "The employer portal showed submission confirmation." }).check();
  await confirm.getByRole("button", { name: "Confirm and mark Applied" }).click();
  await expect(page.getByRole("heading", { name: "Submission confirmed" })).toBeVisible();
  await expect(page.getByText(/Reviewed safe content version \d+ is frozen/)).toBeVisible();

  await appLink(page, "Pipeline").click();
  const applied = page.getByRole("region", { name: "Applied", exact: true }).getByRole("link", { name: /Product Manager, Growth Orchard Commerce/ });
  await expect(applied).toBeVisible();
  await applied.click();
  await page.getByText("Close application…", { exact: true }).click();
  await page.getByRole("button", { name: "They said no" }).click();
  await expect(page.getByText("Application kit · closed")).toBeVisible();
  await expect(page.getByText(/Reviewed safe content version \d+ is frozen/)).toBeVisible();

});

test("a missing application offers a pipeline recovery link", async ({ demo: page }) => {
  await page.goto("/app/applications/00000000-0000-0000-0000-000000000001");
  await expect(page.getByRole("heading", { name: "That page does not exist." })).toBeVisible();
  await page.getByRole("link", { name: "Go to your pipeline" }).click();
  await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
});

test("a safe kit saves a portal answer request and can record different submission materials", async ({ demo: page }) => {
  await appLink(page, "Watchlist").click();
  await page.getByRole("button", { name: "Pick Product Manager, Growth", exact: true }).click();
  await page.getByRole("button", { name: "Prepare 1 kit", exact: true }).click();
  await expect(page.getByText("Application kit · saved")).toBeVisible();
  await page.getByRole("combobox", { name: "Non-personal question" }).selectOption("work-highlight");
  await page.getByRole("spinbutton", { name: "Maximum" }).fill("240");
  await page.getByRole("combobox", { name: "Unit", exact: true }).selectOption("characters");
  await page.getByRole("button", { name: "Ask my Claude for an answer" }).click();
  const request = page.getByText("Describe an example of relevant work. · Max 240 characters", { exact: true });
  await expect(request).toBeVisible();
  await page.reload();
  await expect(request).toBeVisible();
  await expect(page.getByText("Requested", { exact: true })).toBeVisible();
  await expect(page.getByText("Application kit · saved")).toBeVisible();

  const openConfirmation = page.getByRole("button", { name: "I submitted this application" });
  const confirm = page.getByRole("dialog", { name: "Confirm actual submission" });
  await openConfirmation.click();
  await expect(confirm.getByRole("radio", { name: /Reviewed PII-free content/ })).toBeDisabled();
  const date = confirm.getByLabel("Submission date");
  await date.fill(new Date().toISOString().slice(0, 10));
  await confirm.getByRole("radio", { name: "Different materials" }).check();
  await confirm.getByRole("button", { name: "Confirm and mark Applied" }).click();
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Close" }).click();
  await page.reload();
  await expect(page.getByText("Application kit · saved")).toBeVisible();

  await openConfirmation.click();
  await date.fill(new Date().toISOString().slice(0, 10));
  await confirm.getByRole("radio", { name: "Different materials" }).check();
  await confirm.getByRole("checkbox", { name: "The employer portal showed submission confirmation." }).check();
  await confirm.getByRole("button", { name: "Confirm and mark Applied" }).click();
  await expect(page.getByRole("heading", { name: "Submission confirmed" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("You used different materials.")).toBeVisible();
  await expect(page.getByText(/Reviewed safe content version/)).toHaveCount(0);
  await expect(openConfirmation).toHaveCount(0);
});
