import { appLink, expect, test } from "./demo";

test("settings gear and section picker stay accessible on mobile", async ({ demo: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const gear = appLink(page, "Settings");
  await expect(gear).toBeVisible();
  await expect(gear).toHaveAttribute("title", "Settings");
  expect(await gear.boundingBox()).toMatchObject({ width: 44, height: 44 });
  await gear.click();
  await expect(gear).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: /Settings|Assistant/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Settings section: Job search" }).click();
  await page.getByRole("link", { name: "Advanced", exact: true }).click();
  await expect(page.getByRole("button", { name: "Settings section: Advanced" })).toBeVisible();
  await page.getByRole("button", { name: "Settings section: Advanced" }).click();
  await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("unsaved changes stay put on validation failure and can save before continuing", async ({ demo: page }) => {
  await appLink(page, "Settings").click();
  const target = page.getByLabel("Daily role maximum");
  const section = page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "Goals & follow-ups" });
  await target.fill("0");
  await section.click();
  const dialog = page.getByRole("dialog", { name: "Leave with unsaved changes?" });
  await dialog.getByRole("button", { name: "Save and continue" }).click();
  await expect(target).toBeFocused();
  await expect(target).toHaveValue("0");
  await expect(target).toHaveAttribute("aria-invalid", "true");
  await target.fill("12");
  await section.click();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(target).toHaveValue("12");
  await appLink(page, "Today").click();
  await dialog.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL("/app/watchlist");
  await appLink(page, "Settings").click();
  await expect(target).toHaveValue("12");
});

test("a failed save retains the draft and offers retry", async ({ demo: page }) => {
  await appLink(page, "Settings").click();
  const target = page.getByLabel("Daily role maximum");
  await target.fill("5");
  await page.route("**/app/settings", (route) => route.request().method() === "POST" ? route.abort() : route.fallback());
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Your edits are still here.");
  await expect(target).toHaveValue("5");
  await page.unroute("**/app/settings");
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
});

test("settings search opens and focuses a control in a collapsed section", async ({ demo: page }) => {
  await appLink(page, "Settings").click();
  const search = page.getByRole("searchbox", { name: "Find a setting" });
  await search.fill("no matching setting");
  await expect(page.getByText("No matching settings")).toBeVisible();
  await search.fill("cities");
  await page.getByRole("link", { name: /Cities/ }).click();
  await expect(page.getByLabel("Cities", { exact: true })).toBeFocused();
  await search.fill("microphone quiet level");
  await page.getByRole("link", { name: /Microphone quiet level/ }).click();
  const control = page.getByLabel("Microphone quiet level (%)");
  await expect(control).toBeVisible();
  await expect(control).toBeFocused();
});

test("signed-out Assistant links retain the destination after sign-in", async ({ page }) => {
  await page.goto("/app/agent");
  await expect(page).toHaveURL("/signin?next=%2Fapp%2Fsettings%3Fsection%3Dassistant");
});

test("changes to verified claims require a fresh attestation", async ({ demo: page }) => {
  await appLink(page, "Settings").click();
  await page.getByRole("link", { name: "CV & evidence", exact: true }).click();
  await page.getByText("Verified experience and matching evidence", { exact: true }).click();
  const claims = page.locator("details[open]");
  const attestation = claims.getByRole("checkbox", { name: /Each selected claim/ });
  await expect(claims.getByRole("checkbox")).toHaveCount(9);
  const selected = claims.getByRole("checkbox", { checked: true }).first();
  const claim = claims.getByRole("checkbox", { name: await selected.locator("..").innerText(), exact: true });
  await attestation.check();
  await claim.uncheck();
  await expect(attestation).not.toBeChecked();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(attestation).toBeFocused();
  await expect(claim).not.toBeChecked();
  await attestation.check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await page.getByText("Verified experience and matching evidence", { exact: true }).click();
  await expect(claim).not.toBeChecked();
});
