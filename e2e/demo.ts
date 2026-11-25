import { expect, test as base, type Page } from "@playwright/test";

export async function enterDemo(page: Page) {
  await page.goto("/demo");
  await expect(page).toHaveURL(/\/app\/home$/);
  await expect(page.getByRole("complementary", { name: "Demo" })).toContainText("made-up person, Maya");
}

export function appLink(page: Page, name: string) {
  return page.getByRole("navigation", { name: "App", exact: true }).getByRole("link", { name, exact: true });
}

export const test = base.extend<{ demo: Page }>({
  demo: async ({ page }, use) => {
    await enterDemo(page);
    await use(page);
  },
});

export { expect };
