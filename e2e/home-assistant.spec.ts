import { expect, test } from "@playwright/test";

const homeAssistantUrl = process.env.HA_URL;

test("loads the card in a real Home Assistant dashboard", async ({ page }) => {
  test.skip(!homeAssistantUrl, "Set HA_URL and authenticate the browser context to run this test.");
  await page.goto(homeAssistantUrl!);
  const card = page.locator("saltwatch-card").first();
  await expect(card).toBeVisible();
  await expect(card.locator("ha-card")).toHaveAttribute("role", "button");
  const box = await card.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
});
