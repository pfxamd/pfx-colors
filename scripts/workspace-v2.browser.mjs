import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, firefox } from "playwright";

const base = process.env.PFX_COLORS_URL ?? "http://127.0.0.1:4173/pfx-colors/";
mkdirSync("browser-evidence/workspace-v2", { recursive: true });

for (const [browserName, launcher] of [["chromium", chromium], ["firefox", firefox]]) {
  const browser = await launcher.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", err => errors.push(err.message));
      try {
        const response = await page.goto(base, { waitUntil: "networkidle" });
        assert.equal(response?.status(), 200);

        await page.getByRole("button", { name: "light theme" }).click();
        assert.equal(await page.locator(".pfx-v2").getAttribute("data-theme"), "light");
        await page.screenshot({ path: `browser-evidence/workspace-v2/${browserName}-${viewport.width}-light.png`, animations: "disabled" });

        await page.getByRole("button", { name: "dark theme" }).click();
        assert.equal(await page.locator(".pfx-v2").getAttribute("data-theme"), "dark");
        await page.reload({ waitUntil: "networkidle" });
        assert.equal(await page.locator(".pfx-v2").getAttribute("data-theme"), "dark", "Appearance persisted");

        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Explore" }).click();
        await page.locator(".pfx-c-explore").waitFor();
        assert.ok(await page.locator(".pfx-v2__swatch").count() >= 20);
        await page.locator('input[placeholder="Color name or #RRGGBB"]').fill("#ff8800");
        await page.getByRole("button", { name: "Find", exact: true }).click();
        assert.equal((await page.locator('input[aria-label="Current color"]').inputValue()).toLowerCase(), "#ff8800");
        assert.ok(await page.locator(".pfx-v2__swatch").count() >= 1);
        await page.screenshot({ path: `browser-evidence/workspace-v2/${browserName}-${viewport.width}-explore.png`, animations: "disabled" });

        await page.getByRole("button", { name: "Create Tones" }).click();
        await page.locator(".pfx-c-workbench--palette").waitFor();
        assert.equal(await page.locator(".pfx-c-palette-ribbon button").count(), 9);

        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Collections" }).click();
        await page.getByRole("button", { name: "Save current color" }).click();
        assert.ok(await page.locator(".pfx-c-collections .pfx-v2__swatch").count() >= 1);
        await page.getByRole("button", { name: /Recent/ }).click();
        assert.ok(await page.locator(".pfx-c-collections .pfx-v2__swatch").count() >= 1);
        await page.screenshot({ path: `browser-evidence/workspace-v2/${browserName}-${viewport.width}-collections.png`, animations: "disabled" });

        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "No horizontal page overflow");
        assert.deepEqual(errors, [], browserName + " runtime errors");
        console.log("WORKSPACE V2 PASS", browserName, viewport.width);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
