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
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { writeText: async text => { window.__PFX_COPIED__ = text; } },
        });
      });
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

        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Picker" }).click();
        await page.locator(".pfx-picker__field").waitFor();
        const currentInput = page.locator('input[aria-label="Current color"]');
        const beforePicker = await currentInput.inputValue();
        await page.locator(".pfx-picker__field").click({ position: { x: 80, y: 100 } });
        await page.waitForFunction(before =>
          document.querySelector('input[aria-label="Current color"]')?.value !== before,
          beforePicker);
        await page.getByRole("button", { name: "Copy RGB" }).click();
        assert.match(await page.evaluate(() => window.__PFX_COPIED__), /^rgb\(/,
          "Picker copied an actual RGB declaration");
        await page.getByRole("button", { name: "RGB", exact: true }).click();
        const red = page.getByRole("spinbutton", { name: "Red channel" });
        await red.fill("120");
        await red.press("Enter");
        const pickedAfterRgb = await currentInput.inputValue();
        assert.equal(pickedAfterRgb.toLowerCase().slice(1,3), "78", "Numeric RGB editing works");
        const hueRail = page.getByRole("slider", { name: "Hue", exact: true });
        await hueRail.focus();
        await hueRail.press("ArrowRight");
        await page.getByRole("slider", { name: "Opacity" }).focus();
        await page.getByRole("slider", { name: "Opacity" }).press("Home");
        await page.getByRole("button", { name: "Copy HEX", exact: true }).last().click();
        assert.match(await page.evaluate(() => window.__PFX_COPIED__), /^#[0-9A-F]{8}$/,
          "Transparent colors retain their alpha channel in HEX copies");
        await page.getByRole("slider", { name: "Opacity" }).press("End");
        await page.getByRole("button", { name: "Save color" }).click();
        await page.screenshot({ path: `browser-evidence/workspace-v2/${browserName}-${viewport.width}-picker.png`, animations: "disabled" });

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

        const countControl = page.locator('input[aria-label="Number of tones"]');
        await countControl.focus();
        await countControl.press("ArrowRight");
        assert.equal(await page.locator(".pfx-c-palette-ribbon button").count(), 10,
          "Tone count responds to user input");
        await page.getByRole("button", { name: "Darks", exact: true }).click();
        await page.locator('input[aria-label="Lock base color in scale"]').check();
        assert.equal(await page.locator('[aria-label="Base locked"]').count(), 1,
          "Original base color remains locked in the scale");
        await page.locator('input[aria-label="Lock base color in scale"]').uncheck();
        await page.locator(".pfx-c-palette-ribbon button").nth(1).click();
        const editor = page.locator('input[aria-label="Selected tone lightness"]');
        await editor.focus();
        await editor.press("ArrowRight");
        assert.equal(await page.locator('[aria-label="Manually edited"]').count(), 1,
          "Individual tone edit is reflected in the scale");
        await page.getByRole("button", { name: "Export", exact: false }).click();
        const cssDownload = page.waitForEvent("download");
        await page.getByRole("button", { name: "Download CSS" }).click();
        const savedCss = await cssDownload;
        assert.equal(savedCss.suggestedFilename(), "pfx-tones.css");
        await page.getByRole("button", { name: "Copy CSS" }).click();
        assert.match(await page.evaluate(() => window.__PFX_COPIED__ ?? ""),
          /--tone-01:/, "CSS variables copied to clipboard");
        await page.getByRole("button", { name: "Send to Gradient" }).click();
        await page.locator(".pfx-c-workbench--gradient").waitFor();
        assert.equal(await page.locator(".pfx-c-gradient-stop-handle").count(), 10,
          "Tone scale transfers to Gradient without loss");

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
