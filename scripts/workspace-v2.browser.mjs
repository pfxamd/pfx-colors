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
        await page.waitForFunction(() =>
          document.querySelector('input[aria-label="Current color"]')?.value.toLowerCase().slice(1,3) === "78",
          null, { timeout: 5000 });
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
        const search = page.locator('input[placeholder="Color name or #RRGGBB"]');
        const countNamed = await page.locator(".pfx-explore__summary strong").innerText();
        assert.match(countNamed, /148/, "Full 148-name CSS catalog is available");
        await search.fill("royal blue");
        await page.getByRole("button", { name: "Find", exact: true }).click();
        assert.equal(await page.locator(".pfx-c-explore .pfx-v2__swatch").count(), 1,
          "Name search narrows the named catalog");
        await search.fill("");
        await page.getByRole("button", { name: "Find", exact: true }).click();
        await page.getByRole("button", { name: "All RGB", exact: true }).click();
        await page.getByRole("button", { name: "Blue", exact: true }).click();
        await page.waitForFunction(() => document.querySelectorAll(".pfx-c-explore .pfx-v2__swatch").length === 48,
          null, { timeout: 15000 });
        assert.equal(await page.getByRole("button", { name: "Blue", exact: true }).getAttribute("aria-pressed"), "true");
        await page.getByRole("button", { name: "Next", exact: true }).click();
        await page.waitForFunction(() =>
          document.querySelector(".pfx-explore__summary")?.textContent?.includes("Page 2") &&
          document.querySelector(".pfx-explore__summary")?.textContent?.includes("Filtered RGB results") &&
          document.querySelectorAll(".pfx-c-explore .pfx-v2__swatch").length === 48,
          null, { timeout: 15000 });
        await page.getByRole("button", { name: "Previous", exact: true }).click();
        await page.waitForFunction(() => document.querySelectorAll(".pfx-c-explore .pfx-v2__swatch").length === 48,
          null, { timeout: 15000 });
        await page.getByRole("button", { name: "Reset filters", exact: true }).click();
        await page.getByRole("combobox", { name: "RGB browsing order" }).selectOption("reverse");
        assert.match(await page.locator(".pfx-c-explore .pfx-v2__swatch-info span").first().innerText(),
          /#FFFFFF/, "Reverse RGB enumerates complete HEX range");
        await page.getByRole("button", { name: "Set reference" }).click();
        await page.locator(".pfx-c-explore .pfx-v2__swatch-color").nth(1).click();
        assert.match(await page.locator(".pfx-explore__compare-result output").innerText(), /:1 contrast/,
          "Comparison calculates contrast for selected colors");
        await search.fill("#ff8800");
        await page.getByRole("button", { name: "Find", exact: true }).click();
        await page.waitForFunction(() =>
          document.querySelector('input[aria-label="Current color"]')?.value?.toLowerCase() === "#ff8800",
          null, { timeout: 5000 });
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

        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Harmony" }).click();
        await page.locator(".pfx-c-workbench--harmony").waitFor();
        assert.equal(await page.locator(".pfx-c-harmony-presets button").count(), 6,
          "All six harmony relationships available");
        await page.locator(".pfx-c-harmony-presets button[aria-label='analogous']").click();
        assert.equal(await page.locator(".pfx-c-harmony-swatches article").count(), 3);
        const spread = page.getByRole("slider", { name: "Harmony spread" });
        await spread.focus();
        await spread.press("ArrowRight");
        assert.match(await spread.inputValue(), /35/,
          "Adjustable harmony geometry responds to input");
        await page.locator(".pfx-c-harmony-presets button[aria-label='complementary']").click();
        assert.equal(await page.locator('[aria-label^="Drag harmony color "]').count(), 2);
        const wheel = page.getByRole("slider", { name: "Rotate harmony" });
        const beforeRotation = await wheel.getAttribute("aria-valuenow");
        await wheel.focus();
        await wheel.press("ArrowRight");
        assert.notEqual(await wheel.getAttribute("aria-valuenow"), beforeRotation,
          "Harmony wheel rotates from the keyboard");
        await page.getByRole("button", { name: "Copy all HEX" }).click();
        assert.match(await page.evaluate(() => window.__PFX_COPIED__ ?? ""),
          /^#[0-9A-F]{6}\n#[0-9A-F]{6}$/, "All harmony HEX codes copied");
        await page.getByRole("button", { name: "Save set" }).click();
        await page.screenshot({ path: `browser-evidence/workspace-v2/${browserName}-${viewport.width}-harmony.png`, animations: "disabled" });
        await page.getByRole("button", { name: "Send harmony to gradient" }).click();
        await page.locator(".pfx-c-workbench--gradient").waitFor();
        assert.equal(await page.locator(".pfx-c-gradient-stop-handle").count(), 2,
          "Conic gradient received the current harmony set");

        // Exercise gradient composition and source exports without publishing the branch.
        const gradientType = page.getByRole("button", { name: "radial gradient" });
        await gradientType.click();
        assert.equal(await gradientType.getAttribute("aria-pressed"), "true", "Radial type selected");
        const angle = page.getByRole("slider", { name: "Gradient angle" });
        assert.equal(await angle.isDisabled(), true, "Angle disabled for radial geometry");
        await page.getByRole("button", { name: "linear gradient" }).click();
        await angle.focus();
        await angle.press("ArrowRight");
        assert.equal(await angle.isDisabled(), false, "Linear angle editable");
        await page.getByRole("button", { name: "Copy CSS", exact: true }).click();
        assert.match(await page.evaluate(() => window.__PFX_COPIED__), /gradient\(/, "Valid CSS gradient copied");
        const stopsBefore = await page.locator(".pfx-c-gradient-stop-handle").count();
        await page.getByRole("button", { name: "Add gradient stop" }).click();
        assert.equal(await page.locator(".pfx-c-gradient-stop-handle").count(), stopsBefore + 1, "Added stop");
        await page.getByRole("button", { name: "Copy stop HEX" }).click();
        assert.match(await page.evaluate(() => window.__PFX_COPIED__), /^#[0-9A-F]{6}$/, "Stop HEX copied");
        await page.getByRole("button", { name: "Remove selected stop" }).click();
        assert.equal(await page.locator(".pfx-c-gradient-stop-handle").count(), stopsBefore, "Removed stop");
        await page.getByRole("button", { name: "Export", exact: false }).click();
        const cssFileEvent = page.waitForEvent("download");
        await page.getByRole("button", { name: "Download CSS" }).click();
        assert.equal((await cssFileEvent).suggestedFilename(), "pfx-gradient.css");
        const jsonFileEvent = page.waitForEvent("download");
        await page.getByRole("button", { name: "Download JSON" }).click();
        assert.equal((await jsonFileEvent).suggestedFilename(), "pfx-gradient.json");
        await page.getByRole("button", { name: "Copy JSON" }).click();
        const gradientJson = JSON.parse(await page.evaluate(() => window.__PFX_COPIED__));
        assert.equal(gradientJson.stops.length, stopsBefore, "Exported gradient stops retained");
        await page.getByRole("button", { name: "Save colors" }).click();
        await page.screenshot({ path: `browser-evidence/workspace-v2/${browserName}-${viewport.width}-gradient.png`, animations: "disabled" });

        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Collections" }).click();
        await page.getByRole("button", { name: "Save current color" }).click();
        assert.ok(await page.locator(".pfx-c-collections .pfx-v2__swatch").count() >= 1);
        await page.getByRole("button", { name: /Recent/ }).click();
        assert.ok(await page.locator(".pfx-c-collections .pfx-v2__swatch").count() >= 1);
        await page.getByRole("button", { name: /Saved sets/ }).click();
        assert.equal(await page.locator(".pfx-c-collections__set").count(), 2,
          "Harmony and Gradient sets saved to Collections");
        await page.reload({ waitUntil: "networkidle" });
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Collections" }).click();
        await page.getByRole("button", { name: /Saved sets/ }).click();
        assert.equal(await page.locator(".pfx-c-collections__set").count(), 2,
          "Saved Harmony and Gradient sets survive reload");
        await page.getByRole("button", { name: "Remove set Complementary harmony" }).click();
        assert.equal(await page.locator(".pfx-c-collections__set").count(), 1,
          "Harmony set can be removed independently");
        await page.getByRole("button", { name: "Remove set Gradient · linear" }).click();
        assert.equal(await page.locator(".pfx-c-collections__set").count(), 0,
          "Gradient set can be removed independently");
        await page.screenshot({ path: `browser-evidence/workspace-v2/${browserName}-${viewport.width}-collections.png`, animations: "disabled" });

        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "No horizontal page overflow");
        assert.deepEqual(errors, [], browserName + " runtime errors");
        console.log("WORKSPACE V2 PASS", browserName, viewport.width);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
