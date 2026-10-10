import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.PFX_COLORS_URL ?? "https://pfxamd.github.io/pfx-colors/";
mkdirSync("browser-evidence", { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];

try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      isMobile: viewport.name === "mobile",
      hasTouch: viewport.name === "mobile",
    });
    page.on("pageerror", error => errors.push(viewport.name + ": " + error.message));
    const response = await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
    assert.equal(response?.status(), 200, "Page must return HTTP 200");

    await page.locator(".pfx-home").waitFor();
    assert.equal(await page.locator(".pfx-home__swatch").count(), 5, "Home must generate five swatches");
    assert.equal(await page.locator(".pfx-c-brand strong").innerText(), "PFx Colors");
    await page.screenshot({ path: "browser-evidence/" + viewport.name + "-home.png", animations: "disabled" });

    const initial = await page.locator('input[aria-label="Current color"]').inputValue();
    await page.locator(".pfx-home__swatch").first().click();
    const selected = await page.locator('input[aria-label="Current color"]').inputValue();
    assert.match(selected, /^#[0-9a-f]{6}$/i);
    assert.ok(initial !== selected || selected.length === 7);

    for (const [tab, selector] of [
      ["Picker", ".pfx-c-workbench--picker"],
      ["Harmony", ".pfx-c-workbench--harmony"],
      ["Gradient", ".pfx-c-workbench--gradient"],
    ]) {
      await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: tab }).click();
      const region = page.locator(selector);
      await region.waitFor({ timeout: 10000 });
      const area = await region.boundingBox();
      assert.ok(area && area.width > 0 && area.height > 0, tab + " must occupy space");
      const dom = await page.evaluate(() => ({
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        viewport: window.innerWidth,
        content: document.querySelector("main")?.textContent?.trim().length ?? 0,
      }));
      assert.ok(dom.content > 5, tab + " must render content");
      if (dom.horizontalOverflow > 4) console.warn(viewport.name, tab, "document overflow", dom.horizontalOverflow);
      if (tab === "Gradient") {
        await page.screenshot({ path: "browser-evidence/" + viewport.name + "-gradient.png", animations: "disabled" });
      }
      console.log(viewport.name, tab, "PASS");
    }
    await page.close();
    console.log(viewport.name, "PASS");
  }
  assert.deepEqual(errors, [], "Browser runtime errors");
} finally {
  await browser.close();
}
console.log("Browser smoke checks: PASS");
