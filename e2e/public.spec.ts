import { devices } from "@playwright/test";
import { expect, test } from "./demo";

test("landing leads to sign-in or a fictional workspace and back", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/A CV that only says what you can prove/);

  await page.getByRole("link", { name: "Get started" }).click();
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByRole("heading", { name: "Get started" })).toBeVisible();
  await expect(page.getByText("Sign-in is not connected yet", { exact: false })).toBeVisible();
  await page.goBack();

  await page.getByRole("link", { name: "Try the demo" }).click();
  await expect(page).toHaveURL(/\/app\/home$/);
  const banner = page.getByRole("complementary", { name: "Demo" });
  await expect(banner).toContainText("made-up person, Maya");
  await banner.getByRole("button", { name: "Leave demo" }).click();
  await expect(page).toHaveURL("/");
  await expect.poll(async () => (await page.context().cookies()).some(({ name }) => name === "jobsearch_demo")).toBe(false);
});

test("architecture walkthrough switches flow and advances the selected step", async ({ page }) => {
  await page.goto("/architecture");
  await expect(page.getByRole("heading", { name: "How it works, one flow at a time" })).toBeVisible();
  const picker = page.getByRole("group", { name: "Choose what to look at" });
  await picker.getByRole("button", { name: "Tailor the CV" }).click();
  await expect(picker.getByRole("button", { name: "Tailor the CV" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Tailor the CV", exact: true })).toBeVisible();
  const current = page.getByRole("button").and(page.locator('[aria-current="step"]'));
  await expect(current).toHaveText(/^1/);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(current).toHaveText(/^2/);
  await picker.getByRole("button", { name: "Whole system" }).click();
  await expect(page.getByRole("heading", { name: "Every part, by layer" })).toBeVisible();
});

test("an unknown page offers a route back to the start", async ({ page }) => {
  const response = await page.goto("/no-such-jobsearch-screen");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "That page does not exist." })).toBeVisible();
  await page.getByRole("link", { name: "Back to the start" }).click();
  await expect(page).toHaveURL("/");
});

test.describe("phone navigation", () => {
  const { defaultBrowserType: _, ...phone } = devices["Pixel 7"];
  test.use(phone);

  test("the menu identifies the current screen and closes after navigation", async ({ demo }) => {
    const app = demo.getByRole("navigation", { name: "App", exact: true });
    await app.getByRole("button", { name: "Overview" }).click();
    const menu = app.getByRole("navigation", { name: "Pages" });
    await expect(menu.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await menu.getByRole("link", { name: "Pipeline" }).click();
    await expect(demo.getByRole("heading", { name: "Pipeline" })).toBeVisible();
    await expect(menu).toBeHidden();
    await app.getByRole("button", { name: "Pipeline" }).click();
    await demo.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });
});
