import { appLink, enterDemo, expect, test } from "./demo";

test("Today replaces Watchlist in navigation without changing its bookmarked URL", async ({ demo: page }) => {
  await expect(appLink(page, "Watchlist")).toHaveCount(0);
  await expect(appLink(page, "Today")).toHaveAttribute("href", "/app/watchlist");
  await page.goto("/app/watchlist");
  await expect(appLink(page, "Today")).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText("Roles to review");
});

test("workspace pages have one main title without repeating navigation in an eyebrow", async ({ demo: page }) => {
  const main = page.getByRole("main");
  const heading = main.getByRole("heading", { level: 1 });
  for (const [nav, title, eyebrow] of [
    ["Overview", "Follow up with 1 person", /^Overview$/i],
    ["Pipeline", "Applications", /^Pipeline$/i],
    ["Interview", "Interview prep", /^Interview$/i],
    ["Today", "Roles to review", /^(Watchlist|Today)(\s*\/.*)?$/i],
    ["Companies", "Target companies", /^Companies(\s*\/.*)?$/i],
    ["Network", "Network", /^Network$/i],
    ["Experience", "Experience", /^Experience$/i],
    ["Assistant", "Connect an assistant", /^Assistant$/i],
    ["Settings", "Settings", /^(User settings|Settings)$/i],
  ] as const) {
    await test.step(nav, async () => {
      if (nav !== "Overview") await appLink(page, nav).click();
      await expect(heading).toHaveText(title);
      await expect(main.getByRole("paragraph").filter({ hasText: eyebrow })).toHaveCount(0);
    });
  }

  await page.goto("/app/settings/sourcing");
  await expect(heading).toHaveText("Sourcing preferences");
  await expect(main.getByRole("paragraph").filter({ hasText: /^(User settings|Settings)$/i })).toHaveCount(0);

  await appLink(page, "Companies").click();
  await main.getByRole("link", { name: "Orchard Commerce", exact: true }).click();
  await expect(heading).toHaveText("Orchard Commerce");
  await expect(main.getByText("Companies / Shared company record", { exact: true })).toHaveCount(0);

  await appLink(page, "Companies").click();
  await main.getByRole("link", { name: "Import list", exact: true }).click();
  await expect(heading).toHaveText("Bring your company list.");
  await expect(main.getByText("Companies / Import list", { exact: true })).toHaveCount(0);
});

test("Overview switches between progress and market insights and links to Pipeline", async ({ demo: page }) => {
  const mainHeading = await page.getByRole("heading", { level: 1 }).textContent();
  await expect(page.getByRole("link", { name: "Open " + mainHeading, exact: true })).toHaveText("Open");
  const hero = page.getByRole("region", { name: "Follow up with 1 person", exact: true });
  await expect(hero.getByRole("link", { name: "Open Follow up with 1 person", exact: true })).toHaveAttribute("href", "/app/network");
  await expect(hero.getByRole("paragraph")).toHaveCount(0);
  const overview = page.getByRole("navigation", { name: "Overview", exact: true });
  await expect(overview.getByRole("link", { name: "Progress" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("region", { name: "Your streaks" })).toBeVisible();
  await overview.getByRole("link", { name: "Insights" }).click();
  await expect(page.getByRole("heading", { name: "What those roles ask for" })).toBeVisible();
  await overview.getByRole("link", { name: "Progress" }).click();
  await appLink(page, "Pipeline").click();
  await expect(page.getByRole("heading", { name: "Applications", exact: true })).toBeVisible();
  await expect(appLink(page, "Pipeline")).toHaveAttribute("aria-current", "page");
});

test("Home recommends the same number of roles that Today shows as ranked", async ({ demo: page }) => {
  // Clear a higher-priority task so the roles recommendation fits in Home's three steps.
  await page.getByRole("link", { name: /^Send your saved application/ }).click();
  const stage = page.getByRole("region", { name: "Stage" });
  await stage.getByText("Close application…").click();
  await stage.getByRole("button", { name: "They said no" }).click();
  await expect(stage.getByText("Closed: they said no.", { exact: false })).toBeVisible();
  await page.goto("/app/home");

  const recommendation = page.getByRole("link", { name: /^Review \d+ ranked roles? in Today/ });
  const homeCount = (await recommendation.innerText()).match(/\d+/)?.[0];
  await recommendation.click();
  const views = page.getByRole("navigation", { name: "Shortlist view" });
  const ranked = views.getByRole("link", { name: /^Ranked · \d+$/ });
  const rankedCount = (await ranked.innerText()).match(/\d+/)?.[0];
  expect(homeCount).toBe(rankedCount);
});

test("Today persists triage, and Companies adds, removes, and restores a target", async ({ demo: page }, testInfo) => {
  await appLink(page, "Today").click();
  await expect(page.getByRole("heading", { name: "Roles to review" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Target companies", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Needs source setup 1", exact: true }).click();
  await expect(page.getByRole("link", { name: "Harbour Studio", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Kestrel AI", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "All 4", exact: true }).click();
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
  const remove = page.getByRole("dialog", { name: "Remove Example Labs?" });
  await expect(remove.getByText("Saved roles, research and people are unchanged.", { exact: false })).toBeVisible();
  await remove.getByRole("button", { name: "Remove target" }).click();
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
  await appLink(page, "Today").click();
  await page.getByRole("link", { name: "Sourcing preferences" }).click();
  await page.getByRole("spinbutton", { name: "Daily target number" }).fill("1");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await page.getByRole("link", { name: "Back to Today" }).click();
  await expect(page.getByText("Your target:", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Ranked roles" }).getByRole("article")).toHaveCount(1);
});

test("Today persists Later and unpicking without preparing a kit", async ({ demo: page }) => {
  await appLink(page, "Today").click();
  const title = "Product Manager, Growth";
  const pick = page.getByRole("button", { name: "Pick role " + title, exact: true });
  const picked = page.getByRole("button", { name: "Picked " + title, exact: true });
  const prepare = page.getByRole("button", { name: /^Prepare \d+ kits?$/ });
  const views = page.getByRole("navigation", { name: "Shortlist view" });
  await expect(pick).toHaveText("Pick role");
  await pick.click();
  await expect(picked).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(picked).toHaveAttribute("aria-pressed", "true");
  await picked.click();
  await expect(pick).toHaveAttribute("aria-pressed", "false");
  await expect(prepare).toHaveCount(0);

  await page.getByRole("button", { name: "Later: " + title, exact: true }).click();
  await expect(pick).toHaveCount(0);
  await views.getByRole("link", { name: /^Later · / }).click();
  await expect(page).toHaveURL(/view=later$/);
  await page.reload();
  await expect(page.getByRole("region", { name: "Later", exact: true }).getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Restore " + title, exact: true }).click();
  await expect(page.getByRole("heading", { name: "No roles in this view" })).toBeVisible();
  await views.getByRole("link", { name: /^Ranked · / }).click();
  await expect(pick).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("heading", { name: "Saved kits" })).toHaveCount(0);
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
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText("Insights");
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
  await expect(page.getByRole("heading", { name: "Connect an assistant", exact: true })).toBeVisible();
  await page.getByText("Technical details", { exact: true }).click();
  await expect(page.getByText("It connects over MCP", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/signin");
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
