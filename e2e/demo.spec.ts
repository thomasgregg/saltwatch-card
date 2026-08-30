import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/demo/");
  await expect(page.locator("saltwatch-card .level")).toHaveText("62%");
});

test("renders every card mode without horizontal overflow", async ({ page }) => {
  const card = page.locator("saltwatch-card");
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  for (const mode of ["both", "tank", "details"]) {
    await page.locator("#display-mode").selectOption(mode);
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport!.width);
  }
});

test("updates state and theme through the demo host context", async ({ page }) => {
  const cardSurface = page.locator("saltwatch-card ha-card");
  const darkSurface = await cardSurface.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.getByRole("button", { name: "Sensor fault" }).click();
  await expect(page.locator("saltwatch-card .status")).toContainText("Sensor fault");
  await expect(page.locator("saltwatch-card .fault-symbol")).toBeVisible();

  await page.locator("#light-theme").check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("#theme-name")).toHaveText("Light theme");
  await expect.poll(() => cardSurface.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(darkSurface);
});

test("keeps the user's mobile scroll position stable", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile regression");
  await page.evaluate(() => window.scrollTo(0, Math.min(900, document.documentElement.scrollHeight - innerHeight)));
  await page.waitForTimeout(350);
  const first = await page.evaluate(() => window.scrollY);
  expect(first).toBeGreaterThan(100);
  await page.waitForTimeout(750);
  const second = await page.evaluate(() => window.scrollY);
  expect(Math.abs(second - first)).toBeLessThanOrEqual(2);
});
