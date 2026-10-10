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

        assert.equal(await page.locator(".pfx-c-dock").count(), 0,
          "Legacy fixed bottom dock was removed");
        const navColor = page.locator('input[aria-label="Current color"]');
        const colorBefore = await navColor.inputValue();
        assert.equal(await navColor.getAttribute("readonly"), "",
          "HEX appears as a non-editing label by default");
        await page.getByRole("button", { name: "Edit current HEX" }).click();
        await navColor.fill("#336699");
        await navColor.press("Enter");
        await page.waitForFunction(() =>
          document.querySelector('input[aria-label="Current color"]')?.value === "#336699");
        assert.equal(await page.locator(".pfx-v2__color-chip").evaluate(el =>
          getComputedStyle(el).backgroundColor), "rgb(51, 102, 153)",
          "Navbar color chip reflects manually entered HEX");
        await page.getByRole("button", { name: "Copy current color" }).click();
        assert.equal(await page.evaluate(() => window.__PFX_COPIED__), "#336699");
        await page.getByRole("button", { name: "Edit current HEX" }).click();
        await navColor.fill("#xxxxxx");
        await navColor.press("Enter");
        assert.equal(await navColor.getAttribute("aria-invalid"), "true",
          "Invalid HEX is rejected with a validation state");
        assert.equal(await page.locator(".pfx-v2__color-chip").evaluate(el =>
          getComputedStyle(el).backgroundColor), "rgb(51, 102, 153)",
          "Invalid HEX does not affect the active color");
        await navColor.press("Escape");
        assert.equal(await navColor.inputValue(), "#336699");
        await page.getByRole("button", { name: "UNDO" }).click();
        await page.waitForFunction(before =>
          document.querySelector('input[aria-label="Current color"]')?.value.toLowerCase() === before,
          colorBefore.toLowerCase());
        await page.getByRole("button", { name: "REDO" }).click();
        await page.waitForFunction(() =>
          document.querySelector('input[aria-label="Current color"]')?.value === "#336699");
        assert.ok(await page.locator(".pfx-c-header").isVisible(),
          "Color and history controls remain in the header");
        await page.screenshot({ path: `browser-evidence/workspace-v2/${browserName}-${viewport.width}-navbar.png`, animations: "disabled" });

        await page.locator(".pfx-home").waitFor();
        assert.ok(await page.locator(".pfx-home__study-swatches button").count() >= 6,
          "Home has a functioning color-study generator");
        const homeLightness = page.getByRole("slider", { name: "Study Lightness" });
        await homeLightness.focus();
        await homeLightness.press("ArrowRight");
        assert.equal(await homeLightness.inputValue(), "59");
        await page.getByRole("button", { name: "Generate new" }).click();
        assert.match(await page.locator(".pfx-home__study-bar").innerText(), /STUDY 02/);
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Explore" }).click();
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Home" }).click();
        assert.equal(await page.getByRole("slider", { name: "Study Lightness" }).inputValue(), "59",
          "Home generator settings survive tool navigation");
        await page.screenshot({ path: `browser-evidence/workspace-v2/${browserName}-${viewport.width}-home.png`, animations: "disabled" });

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
        await page.locator(".pfx-explore").waitFor();
        assert.equal(await page.locator(".pfx-explore__browse-cell").count(), 96);
        await page.locator("#explore-rgb-atlas > summary").click();
        assert.equal(await page.locator(".pfx-explore__atlas-tile").count(), 64,
          "An exhaustive level starts with 64 RGB regions");
        assert.equal(await page.locator(".pfx-explore__wheel").count(), 1, "Perceptual spectrum available");
        assert.equal(await page.locator(".pfx-explore__depth-map canvas").count(), 1,
          "Gamut-aware color-depth canvas is present");
        const search = page.getByRole("searchbox", { name: "Search a color name or exact HEX" });
        await search.fill("royal blue");
        await page.getByRole("button", { name: /Royal Blue/i }).click();
        assert.equal((await page.locator('input[aria-label="Current color"]').inputValue()).toLowerCase(),
          "#4169e1", "CSS named colors locate an exact sRGB value");
        await search.fill("#ff8800");
        await page.getByRole("button", { name: /Locate color/ }).click();
        await page.waitForFunction(() =>
          document.querySelector('input[aria-label="Current color"]')?.value?.toLowerCase() === "#ff8800",
          null, { timeout: 5000 });
        assert.equal(await page.locator(".pfx-explore__atlas-tile").count(), 64,
          "Exact HEX location opens the final atlas subdivision");
        assert.match(await page.locator(".pfx-explore__atlas-meta").innerText(), /LEVEL 04/);
        await page.locator("#explore-refine > summary").click();
        const hueControl = page.getByRole("slider", { name: /Hue/ }).first();
        await hueControl.focus();
        await hueControl.press("ArrowRight");
        assert.equal(await page.locator(".pfx-explore__atlas-tile").count(), 64,
          "Hue changes preserve atlas navigation");
        await page.getByRole("button", { name: /Back/ }).click();
        assert.match(await page.locator(".pfx-explore__atlas-meta").innerText(), /LEVEL 03/);
        // Regression: very dark colors must become visible when users explore hue.
        await search.fill("#010101");
        await page.getByRole("button", { name: /Locate color/ }).click();
        await page.waitForFunction(() =>
          document.querySelector('input[aria-label="Current color"]')?.value.toLowerCase() === "#010101");
        assert.equal((await page.locator('input[aria-label="Current color"]').inputValue()).toLowerCase(),
          "#010101", "Exact near-black remains deliberately selectable");
        await page.getByRole("group", { name: "Browse color families" }).getByRole("button", { name: "Blue" }).click();
        const vibrantColor = (await page.locator('input[aria-label="Current color"]').inputValue()).toLowerCase();
        assert.notEqual(vibrantColor, "#010101", "Blue family should lift near-black exploration");
        assert.ok(Math.max(...[1, 3, 5].map(i => parseInt(vibrantColor.slice(i, i + 2), 16))) > 130,
          "Chosen family should be visibly brighter than near-black");
        await page.getByRole("button", { name: "Set reference" }).click();
        await search.fill("#ff8800");
        await page.getByRole("button", { name: /Locate color/ }).click();
        assert.equal(await page.locator(".pfx-explore__comparison-swatches > div").count(), 2);
        assert.match(await page.locator(".pfx-explore__comparison-result").innerText(), /:1/,
          "Pinned reference compares with the live selected color");
        await search.fill("#000000");
        await page.getByRole("button", { name: /Locate color/ }).click();
        await page.waitForFunction(() => document.querySelector('input[aria-label="Current color"]')?.value.toLowerCase() === "#000000");
        assert.equal((await page.locator('input[aria-label="Current color"]').inputValue()).toLowerCase(),
          "#000000", "Black remains a valid explicit selection");
        await page.getByRole("slider", { name: /Hue/ }).first().press("ArrowRight");
        assert.notEqual((await page.locator('input[aria-label="Current color"]').inputValue()).toLowerCase(),
          "#000000", "Keyboard hue change from black becomes visible");
        await search.fill("#010101");
        await page.getByRole("button", { name: /Locate color/ }).click();
        await page.waitForFunction(() =>
          document.querySelector('input[aria-label="Current color"]')?.value.toLowerCase() === "#010101");
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Home" }).click();
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Explore" }).click();
        assert.equal((await page.locator('input[aria-label="Current color"]').inputValue()).toLowerCase(),
          "#4778d6", "Entering Explore from near-black starts with a visible discovery color");
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
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Home" }).click();
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Tones" }).click();
        assert.equal(await page.locator(".pfx-c-palette-ribbon button").count(), 10,
          "Tone count survives navigation");
        assert.equal(await page.locator('[aria-label="Manually edited"]').count(), 1,
          "Independent tone edits survive navigation");
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

        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Explore" }).click();
        await page.getByRole("button", { name: "Blue", exact: true }).click();
        const savedExploreColor = (await page.locator('input[aria-label="Current color"]').inputValue()).toLowerCase();
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Home" }).click();
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Explore" }).click();
        assert.equal((await page.locator('input[aria-label="Current color"]').inputValue()).toLowerCase(), savedExploreColor,
          "Explore selection survives tool navigation");
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Harmony" }).click();
        assert.equal(await page.locator('.pfx-c-harmony-presets button[aria-label="complementary"]')
          .getAttribute("aria-pressed"), "true", "Harmony scheme survives tool navigation");
        await page.reload({ waitUntil: "networkidle" });
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Home" }).click();
        assert.equal(await page.getByRole("slider", { name: "Study Lightness" }).inputValue(), "59",
          "Home preferences survive reload");
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Explore" }).click();
        assert.equal(await page.locator(".pfx-explore__wheel").count(), 1,
          "Explore spectrum survives reload");
        assert.equal((await page.locator('input[aria-label="Current color"]').inputValue()).toLowerCase(), savedExploreColor,
          "Selected Explore color survives reload");
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Gradient" }).click();
        assert.equal(await page.locator(".pfx-c-gradient-stop-handle").count(), 2,
          "Gradient stop geometry survives reload");
        const randomGradientButton = page.getByRole("button", { name: "Random gradient" });
        const beforeRandom = await page.locator(".pfx-gradient__css code").textContent();
        await randomGradientButton.click();
        const firstRandom = await page.locator(".pfx-gradient__css code").textContent();
        assert.notEqual(firstRandom, beforeRandom, "Random gradient changes the preview and CSS");
        await randomGradientButton.click();
        const secondRandom = await page.locator(".pfx-gradient__css code").textContent();
        assert.notEqual(secondRandom, firstRandom, "Each click generates a different gradient");
        const randomStopCount = await page.locator(".pfx-c-gradient-stop-handle").count();
        assert.ok(randomStopCount >= 2 && randomStopCount <= 4, "Randomized stops remain editable");
        await page.reload({ waitUntil: "networkidle" });
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Gradient" }).click();
        assert.equal(await page.locator(".pfx-c-gradient-stop-handle").count(), randomStopCount,
          "Random gradient survives reload");
        const historyBefore = await page.locator(".pfx-gradient__css code").textContent();
        const radialButton = page.getByRole("button", { name: "radial gradient" });
        const switchTo = await radialButton.getAttribute("aria-pressed") === "true"
          ? page.getByRole("button", { name: "linear gradient" }) : radialButton;
        await switchTo.click();
        const historyAfter = await page.locator(".pfx-gradient__css code").textContent();
        assert.notEqual(historyAfter, historyBefore, "Changing type updates the gradient");
        await page.getByRole("button", { name: "UNDO" }).click();
        assert.equal(await page.locator(".pfx-gradient__css code").textContent(), historyBefore,
          "Undo restores gradient type and geometry");
        await page.getByRole("button", { name: "REDO" }).click();
        assert.equal(await page.locator(".pfx-gradient__css code").textContent(), historyAfter,
          "Redo restores gradient type and geometry");
        await page.getByRole("button", { name: "Save gradient" }).click();
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Collections" }).click();
        await page.getByRole("button", { name: /Saved gradients/ }).click();
        assert.equal(await page.locator(".pfx-c-collections__gradient-preview").count(), 1,
          "Saved gradients have a separate editable library");
        await page.getByRole("button", { name: "Edit gradient" }).click();
        assert.equal(await page.locator(".pfx-gradient__css code").textContent(), historyAfter,
          "Saved gradient reopens with the complete geometry");
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Collections" }).click();
        const backupDownload = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export backup" }).click();
        const backupFile = await backupDownload;
        assert.equal(backupFile.suggestedFilename(), "pfx-colors-library.json");
        const backupContents = JSON.parse(await (await import("node:fs/promises")).readFile(await backupFile.path(), "utf8"));
        assert.equal(backupContents.gradients.length, 1, "Backup includes complete saved gradients");
        await page.getByRole("button", { name: "Import library backup" }).setInputFiles({
          name: "pfx-colors-library.json", mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(backupContents)),
        });
        await page.getByText("Backup imported · Existing saved items preserved").waitFor();
        await page.getByRole("button", { name: /Saved gradients/ }).click();
        assert.equal(await page.locator(".pfx-c-collections__gradient-preview").count(), 1,
          "Restoring a backup does not duplicate existing saved gradients");

        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "No horizontal page overflow");
        assert.deepEqual(errors, [], browserName + " runtime errors");
        console.log("WORKSPACE V2 PASS", browserName, viewport.width);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
