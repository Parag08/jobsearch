import { utils, write } from "xlsx";
import type { Page } from "@playwright/test";
import { appLink, expect, test } from "./demo";

async function importSampleCsv(page: Page) {
  await appLink(page, "Companies").click();
  await page.getByRole("link", { name: "Import list" }).click();
  await page.getByRole("button", { name: "Sample CSV", exact: true }).click();
  await page.getByRole("button", { name: "Review rows" }).click();
  await page.getByRole("button", { name: "Import 1 company", exact: true }).click();
  await page.getByRole("link", { name: "View Companies" }).click();
}

test("reviews a CSV before changing targets and undoes only the confirmed import after refresh", async ({ demo: page }, testInfo) => {
  await appLink(page, "Companies").click();
  await page.getByRole("link", { name: "Import list" }).click();
  const file = { name: "targets.csv", mimeType: "text/csv",
    buffer: Buffer.from("Employer;Company site;Notes\nAperture Robotics;aperture.com;ignored data\nAperture Robotics;aperture.com;\n;second-example.com;\n;;unmapped only\n") };
  await page.getByLabel("Choose file").setInputFiles(file);
  await expect(page.getByRole("table", { name: "First three mapped rows" })).toContainText("Aperture Robotics");
  await page.getByRole("button", { name: "Review rows" }).click();
  await expect(page.getByRole("button", { name: "Import 1 company", exact: true })).toBeDisabled();
  await expect(page.getByText("Same company as row 2.")).toBeVisible();
  await page.getByRole("link", { name: "‹ Companies" }).click();
  const discard = page.getByRole("dialog", { name: "Discard this import preview?" });
  await discard.getByRole("button", { name: "Discard preview" }).click();
  const targets = page.getByRole("region", { name: "All target companies" });
  await expect(targets.getByRole("link", { name: "Aperture Robotics" })).toHaveCount(0);

  await page.getByRole("link", { name: "Import list" }).click();
  await page.getByLabel("Choose file").setInputFiles(file);
  await page.getByRole("button", { name: "Review rows" }).click();
  await page.getByRole("button", { name: "Fix row 4" }).click();
  const fix = page.getByRole("dialog", { name: "Fix file row 4" });
  await fix.getByRole("textbox", { name: "Company name" }).fill("Second Example");
  await fix.getByRole("button", { name: "Save row" }).click();
  await page.getByRole("button", { name: "Skip 1 problem row" }).click();
  await expect(page.getByRole("table", { name: "Company row review" })).not.toContainText("ignored data");
  await testInfo.attach("Reviewed company rows", { body: await page.screenshot({ path: testInfo.outputPath("company-import-review.png") }), contentType: "image/png" });
  await page.getByRole("button", { name: "Import 2 companies" }).click();
  await expect(page.getByRole("heading", { name: "2 companies added to your targets." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Aperture Robotics" })).toBeVisible();
  await page.getByRole("link", { name: "View Companies" }).click();
  await expect(targets.getByRole("link", { name: "Aperture Robotics" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "2 companies added to your targets." })).toBeVisible();
  await page.getByRole("button", { name: "Undo import" }).click();
  await expect(page.getByRole("heading", { name: "Import undone." })).toBeVisible();
  await expect(targets.getByRole("link", { name: "Aperture Robotics" })).toHaveCount(0);
  await expect(targets.getByRole("link", { name: "Second Example" })).toHaveCount(0);
  await testInfo.attach("Import undone", { body: await page.screenshot({ path: testInfo.outputPath("company-import-undo.png") }), contentType: "image/png" });
});

test("dismisses the banner for one import and keeps its result and Undo below the targets", async ({ demo: page }, testInfo) => {
  await appLink(page, "Companies").click();
  const importTarget = async (company: string) => {
    await page.getByRole("link", { name: "Import list" }).click();
    await page.getByLabel("Choose file").setInputFiles({
      name: "targets.csv", mimeType: "text/csv", buffer: Buffer.from(`Company name\n${company}\n`),
    });
    await page.getByRole("button", { name: "Review rows" }).click();
    await page.getByRole("button", { name: "Import 1 company", exact: true }).click();
    await page.getByRole("link", { name: "View Companies" }).click();
  };
  const bannerHeading = page.getByRole("heading", { name: "1 company added to your targets." });
  const targets = page.getByRole("region", { name: "All target companies" });
  const latest = page.getByRole("region", { name: "Last import" });

  await importTarget("Aperture Robotics");
  await expect(bannerHeading).toBeVisible();
  await testInfo.attach("Before dismissal", { body: await page.screenshot({ path: testInfo.outputPath("last-import-before.png"), fullPage: true }), contentType: "image/png" });
  await page.getByRole("button", { name: "Dismiss", exact: true }).click({ timeout: 5_000 });
  await expect(bannerHeading).toHaveCount(0);
  await expect(latest).toContainText("Last import: 1 added");
  await expect(targets.locator("xpath=following-sibling::*").and(latest)).toBeVisible();
  await page.reload();
  await expect(bannerHeading).toHaveCount(0);
  await expect(latest).toContainText("Last import: 1 added");
  await testInfo.attach("After dismissal and refresh", { body: await page.screenshot({ path: testInfo.outputPath("last-import-after.png"), fullPage: true }), contentType: "image/png" });

  await latest.getByRole("link", { name: "View result" }).click();
  await expect(bannerHeading).toBeVisible();
  await expect(page.getByRole("link", { name: "Aperture Robotics", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dismiss", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "View Companies" }).click();
  await latest.getByRole("button", { name: "Undo import" }).click();
  await expect(latest).toContainText("Import undone");
  await expect(latest.getByRole("button", { name: "Undo import" })).toHaveCount(0);
  await expect(targets.getByRole("link", { name: "Aperture Robotics" })).toHaveCount(0);

  await importTarget("Second Example");
  await expect(bannerHeading).toBeVisible();
  await expect(page.getByRole("button", { name: "Dismiss", exact: true })).toBeVisible();
});

test("does not render a dismissed banner before hydration on reload", async ({ demo: page }) => {
  await importSampleCsv(page);
  const dismiss = page.getByRole("button", { name: "Dismiss", exact: true });
  const footer = page.getByRole("region", { name: "Last import", exact: true });
  await dismiss.click();
  await expect(footer).toBeVisible();

  const scripts = "**/_next/static/**/*.js";
  await page.route(scripts, (route) => route.abort());
  await page.reload();
  await expect(page.getByRole("link", { name: "Example Company", exact: true })).toBeVisible();
  await expect(dismiss).toHaveCount(0);
  await expect(footer).toHaveCount(0);

  await page.unroute(scripts);
  await page.reload();
  await expect(footer).toContainText("Last import: 1 added");
  await expect(dismiss).toHaveCount(0);
});

test("syncs import banner dismissal to an already open tab", async ({ demo: page, context }) => {
  await importSampleCsv(page);
  const otherTab = await context.newPage();
  await otherTab.goto(page.url());
  const otherDismiss = otherTab.getByRole("button", { name: "Dismiss", exact: true });
  await expect(otherDismiss).toBeVisible();

  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  const otherFooter = otherTab.getByRole("region", { name: "Last import", exact: true });
  await expect(otherFooter).toContainText("Last import: 1 added");
  await expect(otherFooter.getByRole("button", { name: "Undo import" })).toBeVisible();
  await expect(otherFooter.getByRole("link", { name: "View result" })).toBeVisible();
  await expect(otherDismiss).toHaveCount(0);
});

test("can still dismiss the Last import banner when browser storage is unavailable", async ({ demo: page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get: () => { throw new DOMException("Browser storage is unavailable", "SecurityError"); },
    });
  });
  await appLink(page, "Companies").click();
  await page.getByRole("link", { name: "Import list" }).click();
  await page.getByRole("button", { name: "Sample CSV", exact: true }).click();
  await page.getByRole("button", { name: "Review rows" }).click();
  await page.getByRole("button", { name: "Import 1 company", exact: true }).click();
  await expect(page.getByRole("link", { name: "View Companies" })).toBeVisible();
  await page.goto("/app/companies");

  const dismiss = page.getByRole("button", { name: "Dismiss", exact: true });
  const footer = page.getByRole("region", { name: "Last import", exact: true });
  await dismiss.click();
  await expect(dismiss).toHaveCount(0);
  await expect(footer.getByRole("button", { name: "Undo import" })).toBeVisible();
  await expect(footer.getByRole("link", { name: "View result" })).toBeVisible();
  await page.reload();
  await expect(dismiss).toBeVisible();
  await expect(footer).toHaveCount(0);
  await expect(page.getByRole("region", { name: "All target companies" }).getByRole("link", { name: "Example Company" })).toBeVisible();
});

test("chooses a visible XLSX worksheet and explicitly links a company identity on mobile", async ({ demo: page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/companies");
  await page.getByRole("button", { name: "Add company" }).click();
  const add = page.getByRole("dialog", { name: "Add a target company" });
  await add.getByRole("textbox", { name: "Company name" }).fill("Northstar Studio");
  await add.getByRole("textbox", { name: "Company website (optional)" }).fill("northstar.com");
  await add.getByRole("button", { name: "Add company" }).click();
  await page.getByRole("button", { name: "Remove Northstar Studio" }).click();
  await page.getByRole("link", { name: "Import list" }).click();
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet([["Header"], ["Unused"]]), "Cover");
  utils.book_append_sheet(book, utils.aoa_to_sheet([["Other data"]]), "Hidden");
  utils.book_set_sheet_visibility(book, "Hidden", 1);
  utils.book_append_sheet(book, utils.aoa_to_sheet([["A note"], ["Company name", "Website"], ["Northstar Group", "northstar.com"]]), "Targets");
  await page.getByLabel("Choose file").setInputFiles({
    name: "targets.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: write(book, { type: "buffer", bookType: "xlsx" }),
  });
  const worksheet = page.getByRole("combobox", { name: "Worksheet" });
  await expect(worksheet.locator("option")).toHaveText(["Cover", "Targets"]);
  await worksheet.selectOption({ label: "Targets" });
  await page.getByRole("spinbutton", { name: "Header row" }).fill("2");
  await page.getByRole("button", { name: "Review rows" }).click();
  await page.getByRole("button", { name: "Fix row 3" }).click();
  await testInfo.attach("Mobile identity review", { body: await page.screenshot({ path: testInfo.outputPath("company-import-mobile-identity.png") }), contentType: "image/png" });
  const fix = page.getByRole("dialog", { name: "Fix file row 3" });
  await fix.getByRole("button", { name: "Use Northstar Studio · https://northstar.com" }).click();
  await expect(page.getByText("Existing record: Northstar Studio · https://northstar.com")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Import 1 company", exact: true }).click();
  await expect(page.getByText("0 new · 1 re-added", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "View Companies" }).click();
  const targets = page.getByRole("region", { name: "All target companies" });
  await expect(targets.getByRole("link", { name: "Northstar Studio" })).toBeVisible();
  await expect(targets.getByRole("link", { name: "Northstar Group" })).toHaveCount(0);
});
