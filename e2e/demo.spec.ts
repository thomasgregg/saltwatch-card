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

test("switches between salt level, forecast, and both values", async ({ page }) => {
  const card = page.locator("saltwatch-card");

  await page.locator("#metric-mode").selectOption("forecast");
  await expect(card.locator(".forecast-value")).toHaveText("18");
  await expect(card.locator(".forecast-label")).toHaveText("Days until low salt");
  await expect(card.locator(".level-metric")).toHaveCount(0);

  await page.locator("#metric-mode").selectOption("both");
  await expect(card.locator(".level")).toHaveText("62%");
  await expect(card.locator(".forecast-value")).toHaveText("18");
  await expect(card.locator(".metric-divider")).toBeVisible();

  await page.locator("#forecast-state").selectOption("Learning");
  await expect(card.locator(".forecast-symbol")).toBeVisible();
  await expect(card.locator(".forecast-value")).not.toContainText("—");
  await expect(card.locator(".forecast-label")).toHaveText("Forecast learning");
  const levelValue = await card.locator(".level-metric .metric-value").boundingBox();
  const forecastValue = await card.locator(".forecast-metric .metric-value").boundingBox();
  const levelLabel = await card.locator(".level-metric .metric-label").boundingBox();
  const forecastLabel = await card.locator(".forecast-metric .metric-label").boundingBox();
  expect(levelValue).not.toBeNull();
  expect(forecastValue).not.toBeNull();
  expect(levelLabel).not.toBeNull();
  expect(forecastLabel).not.toBeNull();
  expect(Math.abs(levelValue!.height - forecastValue!.height)).toBeLessThanOrEqual(0.5);
  if (page.viewportSize()!.width > 400) {
    expect(Math.abs(levelLabel!.y - forecastLabel!.y)).toBeLessThanOrEqual(0.5);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
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

test("keeps every low-state accent on the same HA warning color", async ({ page }) => {
  const readAccents = () => page.locator("saltwatch-card").evaluate((card) => {
    const root = card.shadowRoot;
    const property = (selector: string, name: string) => {
      const element = root?.querySelector(selector);
      return element ? getComputedStyle(element).getPropertyValue(name).trim() : "";
    };
    return [
      property(".threshold", "stroke"),
      property(".threshold-label rect", "fill"),
      property(".status", "color"),
      property(".status-dot", "background-color"),
      property(".marker-line", "background-color"),
    ];
  });

  await page.getByRole("button", { name: "Low salt" }).click();
  const darkAccents = await readAccents();
  expect(new Set(darkAccents).size).toBe(1);

  await page.locator("#light-theme").check();
  const lightAccents = await readAccents();
  expect(new Set(lightAccents).size).toBe(1);
  expect(lightAccents[0]).toBe(darkAccents[0]);
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
