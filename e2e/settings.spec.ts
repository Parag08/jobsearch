import { appLink, enterDemo, expect, test } from "./demo";

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
  const appearance = page.getByRole("group", { name: "Appearance", exact: true });
  const system = appearance.getByRole("button", { name: "System", exact: true });
  await system.click();
  await expect(system).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const panel = page.locator("details").filter({ has: page.getByText("AI models", { exact: true }) });
  await expect(panel).toHaveCSS("background-color", "rgb(31, 41, 56)");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("link", { name: "JobSearch, overview" }).click();
  await expect(page).toHaveURL("/app/home");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");
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
  await page.getByRole("group", { name: "Appearance", exact: true }).getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.getByText("Up to date", { exact: true })).toBeVisible();
  const target = page.getByLabel("Daily role maximum");
  await expect(target).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await target.fill("5");
  await expect(page.getByText("Up to date", { exact: true })).toBeHidden();
  await page.route("**/app/settings", (route) => route.request().method() === "POST" ? route.abort() : route.fallback());
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Your edits are still here.");
  await expect(target).toHaveValue("5");
  await page.unroute("**/app/settings");
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await expect(page.getByText("Up to date", { exact: true })).toBeVisible();
});

test("Back protects a draft without the Navigation API", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "navigation", { value: undefined }));
  await enterDemo(page);
  await appLink(page, "Settings").click();
  const target = page.getByLabel("Daily role maximum");
  await target.fill("12");

  await page.goBack();
  const dialog = page.getByRole("dialog", { name: "Leave with unsaved changes?" });
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(target).toHaveValue("12");
  await expect(page).toHaveURL("/app/settings");

  await page.goBack();
  await dialog.getByRole("button", { name: "Discard" }).click();
  await expect(page).toHaveURL("/app/home");

  await appLink(page, "Settings").click();
  await target.fill("14");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeHidden();
  await page.goBack();
  await expect(page).toHaveURL("/app/home");
});

test("pasting multiline sourcing preferences preserves separate terms after save", async ({ demo: page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await appLink(page, "Settings").click();
  const lists = [
    ["Cities", "Singapore\nKuala Lumpur", "Singapore, Kuala Lumpur"],
    ["Role families", "product manager\nproduct owner", "product manager, product owner"],
    ["Titles to skip", "intern\ndesigner", "intern, designer"],
  ];
  for (const [label, text] of lists) {
    await page.evaluate((value) => navigator.clipboard.writeText(value), text);
    const input = page.getByLabel(label, { exact: true });
    await input.fill("");
    await input.press("ControlOrMeta+v");
  }
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeHidden();
  await page.reload();
  for (const [label, , saved] of lists) {
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(saved);
  }
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
  const control = page.getByLabel("Microphone quiet level", { exact: true });
  await expect(control).toBeVisible();
  await expect(control).toBeFocused();
});

test("Interview rejects an unfinished-answer pause shorter than the finished-answer pause", async ({ demo: page }) => {
  await appLink(page, "Settings").click();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "Interview", exact: true }).click();
  const finished = page.getByRole("spinbutton", { name: "Pause after a finished answer", exact: true });
  const unfinished = page.getByRole("spinbutton", { name: "Pause after an unfinished answer", exact: true });
  await expect(finished).toHaveAccessibleDescription("seconds");
  await finished.fill("2.5");
  await unfinished.fill("1");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(unfinished).toBeFocused();
  await expect(unfinished).toHaveAttribute("aria-invalid", "true");
  await expect(unfinished).toHaveValue("1");
});

test("signed-out Assistant links retain the destination after sign-in", async ({ page }) => {
  await page.goto("/app/agent");
  await expect(page).toHaveURL("/signin?next=%2Fapp%2Fsettings%3Fsection%3Dassistant");
});

test("Settings distinguishes configured numeric defaults from unset weekly goals", async ({ demo: page }) => {
  await appLink(page, "Settings").click();
  await page.getByRole("link", { name: "Goals & follow-ups", exact: true }).click();
  await expect(page.getByText("App default", { exact: true })).toHaveCount(6);
  await expect(page.getByRole("spinbutton", { name: "Applications", exact: true })).toHaveValue("");
  await expect(page.getByRole("spinbutton", { name: "Applications", exact: true })).toHaveAttribute("placeholder", "Not set");
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "Interview", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Topics per interview", exact: true })).toHaveValue("2");
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
