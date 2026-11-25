import { utils, write } from "xlsx";
import { appLink, expect, test } from "./demo";

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

test("a stale company import refreshes the review without saving a partial batch", async ({ demo: page, context }) => {
  await appLink(page, "Companies").click();
  await page.getByRole("link", { name: "Import list" }).click();
  await page.getByLabel("Choose file").setInputFiles({
    name: "targets.csv", mimeType: "text/csv",
    buffer: Buffer.from("Company name,Website\nMeridian Robotics,meridian.com\nBeacon Labs,beacon.com\n"),
  });
  await page.getByRole("button", { name: "Review rows" }).click();
  const confirm = page.getByRole("button", { name: "Import 2 companies", exact: true });
  await expect(confirm).toBeEnabled();

  const other = await context.newPage();
  await other.goto("/app/companies");
  await other.getByRole("button", { name: "Add company" }).click();
  const add = other.getByRole("dialog", { name: "Add a target company" });
  await add.getByRole("textbox", { name: "Company name" }).fill("Beacon Labs");
  await add.getByRole("textbox", { name: "Company website (optional)" }).fill("beacon.com");
  await add.getByRole("button", { name: "Add company" }).click();
  const targets = other.getByRole("region", { name: "All target companies" });
  await expect(targets.getByRole("link", { name: "Beacon Labs", exact: true })).toBeVisible();

  await confirm.click();
  await expect(page.getByRole("alert")).toContainText("Check the updated company matches");
  const review = page.getByRole("table", { name: "Company row review" });
  await expect(review.getByRole("row").filter({ hasText: "Beacon Labs" })).toContainText("Already a target · kept as is");
  await other.reload();
  await expect(targets.getByRole("link", { name: "Meridian Robotics", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Import 1 company", exact: true }).click();
  await expect(page.getByRole("heading", { name: "1 company added to your targets." })).toBeVisible();
  await page.getByRole("button", { name: "Undo import" }).click();
  await expect(page.getByRole("heading", { name: "Import undone." })).toBeVisible();
  await page.getByRole("link", { name: "View Companies" }).click();
  const updatedTargets = page.getByRole("region", { name: "All target companies" });
  await expect(updatedTargets.getByRole("link", { name: "Beacon Labs", exact: true })).toBeVisible();
  await expect(updatedTargets.getByRole("link", { name: "Meridian Robotics", exact: true })).toHaveCount(0);
});
