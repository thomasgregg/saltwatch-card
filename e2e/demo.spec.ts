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

test("scales details typography with the card width", async ({ page }) => {
  const frame = page.locator(".demo-frame");
  const card = page.locator("saltwatch-card");
  await page.locator("#display-mode").selectOption("details");
  await page.locator("#metric-mode").selectOption("both");

  await frame.evaluate((element) => { element.style.width = "220px"; });
  await expect(card.locator(".metrics-both")).toBeVisible();
  const narrow = await card.evaluate((element) => {
    const root = element.shadowRoot!;
    const surface = root.querySelector("ha-card")!.getBoundingClientRect();
    const values = [...root.querySelectorAll<HTMLElement>(".metric-value")];
    return {
      width: surface.width,
      fontSize: Number.parseFloat(getComputedStyle(values[0]!).fontSize),
      valuesInside: values.every((value) => {
        const box = value.getBoundingClientRect();
        return box.left >= surface.left - 1 && box.right <= surface.right + 1;
      }),
    };
  });

  await frame.evaluate((element) => { element.style.width = "720px"; });
  const wide = await card.evaluate((element) => {
    const root = element.shadowRoot!;
    const surface = root.querySelector("ha-card")!.getBoundingClientRect();
    const value = root.querySelector<HTMLElement>(".metric-value")!;
    return {
      width: surface.width,
      fontSize: Number.parseFloat(getComputedStyle(value).fontSize),
    };
  });

  expect(narrow.width).toBeCloseTo(220, 0);
  expect(narrow.valuesInside).toBe(true);
  expect(wide.width).toBeCloseTo(720, 0);
  expect(wide.fontSize).toBeGreaterThan(narrow.fontSize);
});

test("keeps paired values aligned when one label wraps", async ({ page }) => {
  const frame = page.locator(".demo-frame");
  const card = page.locator("saltwatch-card");
  await page.locator("#display-mode").selectOption("details");
  await page.locator("#metric-mode").selectOption("both");
  await frame.evaluate((element) => { element.style.width = "420px"; });
  await expect(card.locator(".metrics-both")).toBeVisible();

  const result = await card.evaluate((element) => {
    const root = element.shadowRoot!;
    const levelValue = root.querySelector<HTMLElement>(".level-metric .metric-value")!;
    const forecastValue = root.querySelector<HTMLElement>(".forecast-metric .metric-value")!;
    const levelLabel = root.querySelector<HTMLElement>(".level-metric .metric-label")!;
    const forecastLabel = root.querySelector<HTMLElement>(".forecast-metric .metric-label")!;
    forecastLabel.style.maxWidth = "100px";
    forecastLabel.style.marginInline = "auto";

    return {
      levelTop: levelValue.getBoundingClientRect().top,
      forecastTop: forecastValue.getBoundingClientRect().top,
      levelLabelHeight: levelLabel.getBoundingClientRect().height,
      forecastLabelHeight: forecastLabel.getBoundingClientRect().height,
    };
  });

  expect(result.forecastLabelHeight).toBeGreaterThan(result.levelLabelHeight);
  expect(result.forecastTop).toBeCloseTo(result.levelTop, 0);
});

test("keeps the percentage visible in a 6 by 4 horizontal details card", async ({ page }) => {
  const frame = page.locator(".demo-frame");
  const card = page.locator("saltwatch-card");
  await frame.evaluate((element) => {
    element.style.width = "420px";
    element.style.height = "450px";
  });
  await card.evaluate((element) => {
    (element as HTMLElement & { setConfig: (config: Record<string, unknown>) => void }).setConfig({
      type: "custom:saltwatch-card",
      entity: "sensor.saltwatch_salt_level",
      status_entity: "sensor.saltwatch_salt_status",
      forecast_entity: "sensor.saltwatch_estimated_days_until_low_salt",
      forecast_status_entity: "sensor.saltwatch_forecast_status",
      display_mode: "details",
      metric_mode: "both",
      show_status: true,
      show_low_marker: false,
      grid_options: { columns: 6, rows: 4 },
    });
  });

  await expect(card.locator("ha-card")).toHaveClass(/fixed-height/);
  const result = await card.evaluate((element) => {
    const root = element.shadowRoot!;
    const levelMetric = root.querySelector<HTMLElement>(".level-metric")!;
    const forecastMetric = root.querySelector<HTMLElement>(".forecast-metric")!;
    const levelValue = root.querySelector<HTMLElement>(".level-metric .metric-value")!;
    const levelBounds = levelMetric.getBoundingClientRect();
    const forecastBounds = forecastMetric.getBoundingClientRect();
    return {
      metricsAreHorizontal: forecastBounds.left > levelBounds.right,
      valueClientWidth: levelValue.clientWidth,
      valueScrollWidth: levelValue.scrollWidth,
    };
  });

  expect(result.metricsAreHorizontal).toBe(true);
  expect(result.valueScrollWidth).toBeLessThanOrEqual(result.valueClientWidth + 1);
});

test("keeps every fixed-row card mode inside its assigned height", async ({ page }) => {
  const frame = page.locator(".demo-frame");
  const card = page.locator("saltwatch-card");
  const cases = [
    { displayMode: "details", width: 220, height: 150 },
    { displayMode: "tank", width: 360, height: 180 },
    { displayMode: "both", width: 720, height: 250 },
  ];

  for (const current of cases) {
    await frame.evaluate((element, size) => {
      element.style.width = `${size.width}px`;
      element.style.height = `${size.height}px`;
    }, current);
    await card.evaluate((element, options) => {
      (element as HTMLElement & { setConfig: (config: Record<string, unknown>) => void }).setConfig({
        type: "custom:saltwatch-card",
        entity: "sensor.saltwatch_salt_level",
        status_entity: "sensor.saltwatch_salt_status",
        threshold_entity: "number.saltwatch_low_salt_threshold",
        forecast_entity: "sensor.saltwatch_estimated_days_until_low_salt",
        forecast_status_entity: "sensor.saltwatch_forecast_status",
        display_mode: options.displayMode,
        metric_mode: "both",
        show_status: true,
        show_low_marker: true,
        grid_options: { columns: 12, rows: 2 },
      });
    }, current);

    const result = await card.evaluate((element) => {
      const root = element.shadowRoot!;
      const surface = root.querySelector("ha-card")!.getBoundingClientRect();
      const content = [
        root.querySelector<HTMLElement>(".tank"),
        root.querySelector<HTMLElement>(".status"),
        ...root.querySelectorAll<HTMLElement>(".metric-value,.metric-label"),
        root.querySelector<HTMLElement>(".threshold-summary"),
      ].filter((item): item is HTMLElement => Boolean(item));
      return {
        fixedHeight: root.querySelector("ha-card")!.classList.contains("fixed-height"),
        height: surface.height,
        contentInside: content.every((item) => {
          const box = item.getBoundingClientRect();
          return box.top >= surface.top - 1 && box.bottom <= surface.bottom + 1;
        }),
      };
    });

    expect(result.fixedHeight).toBe(true);
    expect(result.height).toBeCloseTo(current.height, 0);
    expect(result.contentInside).toBe(true);
  }
});

test("keeps the stacked metric divider thin without clipping the forecast label", async ({ page }) => {
  const frame = page.locator(".demo-frame");
  const card = page.locator("saltwatch-card");
  await frame.evaluate((element) => {
    element.style.width = "360px";
    element.style.height = "420px";
  });
  await card.evaluate((element) => {
    (element as HTMLElement & { setConfig: (config: Record<string, unknown>) => void }).setConfig({
      type: "custom:saltwatch-card",
      entity: "sensor.saltwatch_salt_level",
      status_entity: "sensor.saltwatch_salt_status",
      forecast_entity: "sensor.saltwatch_estimated_days_until_low_salt",
      forecast_status_entity: "sensor.saltwatch_forecast_status",
      display_mode: "details",
      metric_mode: "both",
      show_status: true,
      show_low_marker: false,
      grid_options: { columns: 9, rows: 7 },
    });
  });

  await expect(card.locator("ha-card")).toHaveClass(/fixed-height/);
  const result = await card.evaluate((element) => {
    const root = element.shadowRoot!;
    const surface = root.querySelector("ha-card")!.getBoundingClientRect();
    const divider = root.querySelector<HTMLElement>(".metric-divider")!.getBoundingClientRect();
    const level = root.querySelector<HTMLElement>(".level-metric .metric-value")!.getBoundingClientRect();
    const forecast = root.querySelector<HTMLElement>(".forecast-metric .metric-value")!.getBoundingClientRect();
    const forecastLabel = root.querySelector<HTMLElement>(".forecast-metric .metric-label")!.getBoundingClientRect();
    return {
      dividerHeight: divider.height,
      dividerWidth: divider.width,
      metricsAreStacked: forecast.top > level.bottom,
      forecastLabelInside: forecastLabel.bottom <= surface.bottom + 1,
    };
  });

  expect(result.dividerHeight).toBeCloseTo(1, 0);
  expect(result.dividerWidth).toBeGreaterThan(100);
  expect(result.metricsAreStacked).toBe(true);
  expect(result.forecastLabelInside).toBe(true);
});

test("detects a constrained Home Assistant preview without grid options", async ({ page }) => {
  const frame = page.locator(".demo-frame");
  const card = page.locator("saltwatch-card");
  await frame.evaluate((element) => {
    element.style.width = "720px";
    element.style.height = "220px";
  });
  await card.evaluate((element) => {
    (element as HTMLElement & { setConfig: (config: Record<string, unknown>) => void }).setConfig({
      type: "custom:saltwatch-card",
      entity: "sensor.saltwatch_salt_level",
      status_entity: "sensor.saltwatch_salt_status",
      threshold_entity: "number.saltwatch_low_salt_threshold",
      forecast_entity: "sensor.saltwatch_estimated_days_until_low_salt",
      forecast_status_entity: "sensor.saltwatch_forecast_status",
      display_mode: "details",
      metric_mode: "both",
      show_status: true,
      show_low_marker: true,
    });
  });

  await expect(card.locator("ha-card")).toHaveClass(/fixed-height/);
  const contentInside = await card.evaluate((element) => {
    const root = element.shadowRoot!;
    const surface = root.querySelector("ha-card")!.getBoundingClientRect();
    return [
      root.querySelector<HTMLElement>(".status"),
      ...root.querySelectorAll<HTMLElement>(".metric-value,.metric-label"),
      root.querySelector<HTMLElement>(".threshold-summary"),
    ].filter((item): item is HTMLElement => Boolean(item)).every((item) => {
      const box = item.getBoundingClientRect();
      return box.top >= surface.top - 1 && box.bottom <= surface.bottom + 1;
    });
  });
  expect(contentInside).toBe(true);
});

test("keeps natural-height cards out of compact mode", async ({ page }) => {
  const card = page.locator("saltwatch-card");
  await expect(card.locator("ha-card")).not.toHaveClass(/fixed-height/);
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
  const forecastMetric = await card.locator(".forecast-metric").boundingBox();
  const forecastSymbol = await card.locator(".forecast-symbol").boundingBox();
  const reading = await card.locator(".reading").boundingBox();
  const metrics = await card.locator(".metrics").boundingBox();
  expect(levelValue).not.toBeNull();
  expect(forecastValue).not.toBeNull();
  expect(levelLabel).not.toBeNull();
  expect(forecastLabel).not.toBeNull();
  expect(forecastMetric).not.toBeNull();
  expect(forecastSymbol).not.toBeNull();
  expect(reading).not.toBeNull();
  expect(metrics).not.toBeNull();
  expect(Math.abs(levelValue!.height - forecastValue!.height)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(
    forecastMetric!.x + forecastMetric!.width / 2
      - (forecastSymbol!.x + forecastSymbol!.width / 2),
  )).toBeLessThanOrEqual(0.5);
  expect(Math.abs(
    reading!.y + reading!.height / 2 - (metrics!.y + metrics!.height / 2),
  )).toBeLessThanOrEqual(2);
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
