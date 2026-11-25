import { appLink, enterDemo, expect, test } from "./demo";

test("Overview switches between progress and market insights and links to Pipeline", async ({ demo: page }) => {
  const overview = page.getByRole("navigation", { name: "Overview", exact: true });
  await expect(overview.getByRole("link", { name: "Progress" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("region", { name: "Your streaks" })).toBeVisible();
  await overview.getByRole("link", { name: "Insights" }).click();
  await expect(page.getByRole("heading", { name: "What those roles ask for" })).toBeVisible();
  await overview.getByRole("link", { name: "Progress" }).click();
  await page.getByRole("region", { name: "Across your search" }).getByRole("link", { name: /Pipeline/ }).click();
  await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
  await expect(appLink(page, "Pipeline")).toHaveAttribute("aria-current", "page");
});

test("Today persists triage, and Companies adds, removes, and restores a target", async ({ demo: page }, testInfo) => {
  await appLink(page, "Watchlist").click();
  await expect(page.getByRole("heading", { name: "Your next good move." })).toBeVisible();
  await testInfo.attach("Today shortlist", { body: await page.screenshot({ path: testInfo.outputPath("today-shortlist.png") }), contentType: "image/png" });
  const role = page.getByRole("button", { name: "Dismiss Program Manager, Platform" });
  await role.click();
  await expect(role).toBeHidden();
  await page.getByRole("link", { name: /^Dismissed · / }).click();
  await expect(page).toHaveURL(/view=dismissed/);
  await page.reload();
  await page.getByRole("button", { name: "Restore Program Manager, Platform" }).click();
  await expect(page.getByRole("button", { name: "Restore Program Manager, Platform" })).toBeHidden();

  await appLink(page, "Companies").click();
  await page.getByRole("button", { name: "Add company" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a target company" });
  await dialog.getByRole("textbox", { name: "Company name" }).fill("Example Labs");
  const website = dialog.getByRole("textbox", { name: "Company website (optional)" });
  await website.fill("https://127.0.0.1");
  await dialog.getByRole("button", { name: "Add company" }).click();
  await expect(dialog.getByRole("alert")).toContainText("public HTTPS");
  await expect(dialog.getByRole("textbox", { name: "Company name" })).toHaveValue("Example Labs");
  await website.fill("https://example.com");
  await dialog.getByRole("button", { name: "Add company" }).click();
  const companies = page.getByRole("region", { name: "All target companies" });
  await expect(companies.getByRole("link", { name: "Example Labs" })).toBeVisible();
  await testInfo.attach("Target companies", { body: await page.screenshot({ path: testInfo.outputPath("target-companies.png") }), contentType: "image/png" });
  await companies.getByRole("button", { name: "Remove Example Labs" }).click();
  await expect(companies.getByRole("link", { name: "Example Labs" })).toBeHidden();
  await page.reload();
  await page.getByRole("button", { name: "Undo" }).click();
  await companies.getByRole("link", { name: "Example Labs" }).click();
  await page.getByRole("textbox", { name: "Public ATS board URL" }).fill("https://jobs.lever.co/example-typo");
  await page.getByRole("button", { name: "Connect board" }).click();
  await page.getByText("Replace board", { exact: true }).click();
  await page.getByRole("textbox", { name: "Public ATS board URL" }).fill("https://jobs.lever.co/example-labs");
  await page.getByRole("button", { name: "Save replacement" }).click();
  await expect(page.getByRole("link", { name: "lever board" })).toHaveAttribute("href", "https://jobs.lever.co/example-labs");
  await page.getByRole("navigation", { name: "Company views" }).getByRole("link", { name: "Company research" }).click();
  await page.getByRole("button", { name: "Ask my Claude for company research" }).click();
  await expect(page.getByRole("button", { name: "Copy Claude request" })).toBeVisible();
});

test("sourcing preferences control the shortlist maximum without padding", async ({ demo: page }) => {
  await appLink(page, "Watchlist").click();
  await page.getByRole("link", { name: "Sourcing preferences" }).click();
  await page.getByRole("spinbutton", { name: "Daily target number" }).fill("1");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await page.getByRole("link", { name: "Back to Today" }).click();
  await expect(page.getByText("Your target: 1 maximum")).toBeVisible();
  await expect(page.getByRole("region", { name: "Ranked roles" }).getByRole("article")).toHaveCount(1);
});

test("Network adds a contact and logs a conversation without leaking it into another demo", async ({ demo: page, browser, baseURL }) => {
  await appLink(page, "Network").click();
  await expect(page.getByRole("heading", { name: "Network" })).toBeVisible();
  const add = page.getByRole("region", { name: "Add a person" });
  await add.getByRole("textbox", { name: "Name or LinkedIn link" }).fill("Jamie Sutton");
  await add.getByRole("textbox", { name: "Company" }).fill("Example Labs");
  await add.getByRole("combobox", { name: "Warmth" }).selectOption("warm");
  await add.getByRole("button", { name: "Add person" }).click();

  const person = page.getByRole("listitem").filter({ hasText: "Jamie Sutton" }).filter({ has: page.getByText("Log a conversation", { exact: true }) });
  await person.getByText("Log a conversation", { exact: true }).click();
  const summary = "Discussed the product operations team";
  await person.getByRole("textbox", { name: "What was said" }).fill(summary);
  await person.getByRole("button", { name: "Log it" }).click();
  await expect(page.getByText(/Jamie Sutton is logged. Follow up on/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(`Last: ${summary}`, { exact: false })).toBeVisible();

  const other = await browser.newContext({ baseURL });
  try {
    const otherPage = await other.newPage();
    await enterDemo(otherPage);
    await appLink(otherPage, "Network").click();
    await expect(otherPage.getByRole("heading", { name: "Network" })).toBeVisible();
    await expect(otherPage.getByText("Jamie Sutton", { exact: false })).toHaveCount(0);
  } finally {
    await other.close();
  }
});

test("Insights filters the evidence summary by job title and clears the filter", async ({ demo: page }) => {
  await appLink(page, "Pipeline").click();
  await page.getByRole("link", { name: "Role insights", exact: true }).click();
  await page.getByRole("navigation", { name: "Role families" }).getByRole("link", { name: /^Product management/ }).click();
  await expect(page).toHaveURL(/family=product-management$/);
  const search = page.getByRole("search");
  const summary = page.getByRole("region", { name: "Summary" });
  await expect(summary.getByText("What they ask for", { exact: true })).toBeVisible();
  const originalRoute = page.url();
  const rolesRead = summary.getByText(/^Roles read/);
  const originalSelection = await rolesRead.innerText();
  const title = search.getByRole("searchbox");
  await title.fill("Product");
  await search.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/title=Product/i);
  await expect(rolesRead).not.toHaveText(originalSelection);
  await expect(rolesRead).toContainText("“Product”");
  await search.getByRole("link", { name: "Clear" }).click();
  await expect(title).toHaveValue("");
  await expect(page).toHaveURL(originalRoute);
  await expect(rolesRead).toHaveText(originalSelection);
});

test("Experience creates, revises and deletes a point in the evidence bank", async ({ demo: page }) => {
  await appLink(page, "Experience").click();
  await expect(page.getByRole("heading", { name: "Experience" })).toBeVisible();
  const role = page.locator("details[open]").filter({ has: page.getByRole("button", { name: /^Add a point to / }) }).first();
  await role.getByRole("button", { name: /^Add a point to / }).click();
  const first = "Reduced trial setup time by 24% through guided templates.";
  const revised = "Reduced trial setup time by 24% by piloting guided templates.";
  await page.getByRole("textbox", { name: /^Wording/ }).fill(first);
  await page.getByRole("button", { name: "Add point", exact: true }).click();
  await page.getByRole("button", { name: /Edit point: Reduced trial setup time/ }).click();
  await page.getByRole("textbox", { name: /^Wording/ }).fill(revised);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(revised, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(revised, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Edit point: Reduced trial setup time/ }).click();
  await page.getByRole("button", { name: "Delete point" }).click();
  await page.getByRole("alertdialog", { name: "Delete this point?" }).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText(revised, { exact: true })).toHaveCount(0);
});

test("Assistant shows setup instructions but does not issue keys to demo users", async ({ demo: page }) => {
  await appLink(page, "Assistant").click();
  await expect(page.getByRole("heading", { name: "AI assistant", exact: true })).toBeVisible();
  await page.getByText("Technical details", { exact: true }).click();
  await expect(page.getByText("It connects over MCP", { exact: false })).toBeVisible();
  await expect(page.getByText("Keys need a signed-in account", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create key" })).toHaveCount(0);
});

test("Settings saves a board preference across a reload", async ({ demo: page }) => {
  await appLink(page, "Settings").click();
  const setting = page.getByLabel("Cards per column", { exact: false });
  await setting.fill("3");
  await page.getByRole("button", { name: /Save settings/i }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await expect(setting).toHaveValue("3");
});
