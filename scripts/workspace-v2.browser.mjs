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
        const quickPalette = page.locator(".pfx-home__palette");
        assert.equal(await quickPalette.locator(".pfx-home__swatch").count(), 5,
          "Home presents exactly five selectable colors");
        assert.equal(await page.locator(".pfx-home__generator").count(), 1);
        assert.equal(await page.locator(".pfx-home__controls, .pfx-home__extras, .pfx-home__routes").count(), 0,
          "Home has no old dashboard sections");
        const initialPalette = await page.locator(".pfx-home__code").allTextContents();
        await page.getByRole("button", { name: "Generate", exact: true }).click();
        const generatedPalette = await page.locator(".pfx-home__code").allTextContents();
        assert.notDeepEqual(generatedPalette, initialPalette, "Generate produces a fresh palette");
        const expectedHomeHex = generatedPalette[0].toLowerCase();
        await quickPalette.locator(".pfx-home__swatch").first().click();
        await page.waitForFunction(expected =>
          document.querySelector('input[aria-label="Current color"]')?.value.toLowerCase() === expected,
          expectedHomeHex);
        assert.equal((await navColor.inputValue()).toLowerCase(), expectedHomeHex,
          "Choosing a swatch updates the navbar");
        await page.locator(".pfx-home__code").first().click();
        assert.equal(await page.evaluate(() => window.__PFX_COPIED__), expectedHomeHex.toUpperCase(),
          "Color HEX copies from the quick palette");
        if (viewport.width >= 1200) {
          const homeMetrics = await page.locator(".pfx-home").evaluate(el => ({
            scroll: el.scrollHeight - el.clientHeight,
            card: el.querySelector(".pfx-home__generator").getBoundingClientRect().width,
          }));
          assert.ok(homeMetrics.scroll <= 1, "Desktop Home does not scroll");
          assert.ok(homeMetrics.card <= 650, "Quick Palette leaves space for future tools");
        }
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Explore" }).click();
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Home" }).click();
        assert.deepEqual(await page.locator(".pfx-home__code").allTextContents(), generatedPalette,
          "Quick Palette survives tool navigation");
        await page.screenshot({ path: `browser-evidence/workspace-v2/${browserName}-${viewport.width}-home.png`, animations: "disabled" });

        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Picker" }).click();
        await page.locator(".pfx-picker__field").waitFor();
        const pickerPanel = page.locator(".pfx-picker");
        const format = page.getByRole("combobox", { name: "Color format" });
        const valueField = page.getByRole("textbox", { name: "Selected color value" });
        const currentInput = page.locator('input[aria-label="Current color"]');
        const fit = await pickerPanel.evaluate(el => {
          const page = el.getBoundingClientRect();
          const card = el.querySelector(".pfx-picker__canvas-card").getBoundingClientRect();
          const value = el.querySelector(".pfx-picker__value-input").getBoundingClientRect();
          const chooser = el.querySelector(".pfx-picker__format").getBoundingClientRect();
          const copy = el.querySelector(".pfx-picker__copy").getBoundingClientRect();
          const field = el.querySelector(".pfx-picker__field").getBoundingClientRect();
          return { pageWidth: page.width, pageLeft: page.left, cardWidth: card.width,
            cardLeft: card.left, fieldWidth: field.width, valueWidth: value.width,
            valueRight: value.right, formatLeft: chooser.left, formatRight: chooser.right,
            copyLeft: copy.left, copyRight: copy.right,
            overflowX: el.scrollWidth-el.clientWidth };
        });
        assert.ok(fit.overflowX <= 2, "Picker has no horizontal overflow");
        assert.ok(fit.cardWidth <= 524 && fit.cardWidth >= 285, "One compact picker card");
        assert.ok(fit.fieldWidth >= 250, "Picker field is usable");
        assert.ok(fit.valueWidth >= 90 && fit.valueWidth <= 240,
          "Color value is content-sized, not stretched");
        assert.ok(fit.formatLeft - fit.valueRight <= 14 &&
          fit.copyLeft - fit.formatRight <= 14, "Format and copy stay beside the value");
        assert.ok(fit.cardLeft-fit.pageLeft <= 32, "Card is left-anchored");
        if (viewport.width >= 1200) assert.ok(fit.pageWidth-fit.cardWidth >= 500,
          "Space is reserved for later instruments");
        assert.equal(await pickerPanel.locator(".pfx-picker__canvas-card").count(), 1);
        assert.equal(await pickerPanel.locator(".pfx-picker__inspector").count(), 0);
        assert.ok(await page.getByRole("slider", { name: "Opacity" }).isVisible());
        assert.ok(await page.getByRole("slider", { name: "Saturation" }).isVisible());
        assert.ok(await page.getByRole("slider", { name: "Lightness" }).isVisible());
        const sliderPaint = await page.locator(".pfx-picker__canvas-card").evaluate(card =>
          ["opacity", "saturation", "lightness"].map(kind => {
            const rail = card.querySelector(".pfx-picker__rail--" + kind);
            const input = rail?.querySelector('input[type="range"]');
            const style = rail && getComputedStyle(rail);
            return {
              kind,
              gradient: style?.getPropertyValue("--pfx-rail-gradient").trim() ?? "",
              checker: style?.getPropertyValue("--pfx-rail-checker").trim() ?? "",
              thumb: style?.getPropertyValue("--pfx-rail-thumb").trim() ?? "",
              appearance: input ? getComputedStyle(input).appearance : "",
            };
          }));
        for (const rail of sliderPaint) {
          assert.match(rail.gradient, /linear-gradient\(/,
            rail.kind + " uses a model-aware gradient, not native gray fill");
          assert.ok(rail.thumb.length > 6, rail.kind + " has a custom color thumb");
          assert.equal(rail.appearance, "none", rail.kind + " uses custom native-range styling");
        }
        assert.match(sliderPaint[0].checker, /conic-gradient\(/, "Opacity shows real transparency");
        assert.match(sliderPaint[1].gradient, /hsl\(/, "Saturation follows active HSL");
        assert.match(sliderPaint[2].gradient, /50%\) 50%/, "Lightness has the HSL midpoint");
        assert.equal(await format.inputValue(), "hex");
        assert.equal((await valueField.inputValue()).toLowerCase(), (await currentInput.inputValue()).toLowerCase());
        const beforePicker = await currentInput.inputValue();
        await page.locator(".pfx-picker__field").click({ position: { x: 80, y: 100 } });
        await page.waitForFunction(previous =>
          document.querySelector('input[aria-label="Current color"]')?.value !== previous, beforePicker);
        assert.equal(await pickerPanel.locator(".pfx-c-color-cursor__readout").count(), 0,
          "Picker must not show the redundant floating HEX/S/L readout");
        assert.equal(await pickerPanel.locator(".pfx-picker__precision-cursor").count(), 1,
          "Picker has exactly one small selector");
        const cursor = await page.locator(".pfx-picker__field").evaluate(field => {
          const marker = field.querySelector(".pfx-picker__precision-cursor");
          const markerStyle = getComputedStyle(marker);
          const fieldRect = field.getBoundingClientRect();
          const markerRect = marker.getBoundingClientRect();
          const style = marker.style;
          const x = parseFloat(style.left) / 100;
          const y = parseFloat(style.top) / 100;
          return {
            width: markerRect.width, height: markerRect.height,
            pointerEvents: markerStyle.pointerEvents,
            color: markerStyle.backgroundColor,
            dot: getComputedStyle(marker, "::after").content,
            deltaX: Math.abs(markerRect.left + markerRect.width / 2 -
              (fieldRect.left + x * fieldRect.width)),
            deltaY: Math.abs(markerRect.top + markerRect.height / 2 -
              (fieldRect.top + y * fieldRect.height)),
          };
        });
        assert.ok(cursor.width >= 17 && cursor.width <= 20, "Selector stays small");
        assert.ok(cursor.height >= 17 && cursor.height <= 20, "Selector is circular");
        assert.equal(cursor.pointerEvents, "none", "Selector must not consume pointer events");
        assert.ok(cursor.dot !== "none", "Selector has a precise center dot");
        assert.ok(cursor.deltaX <= 1 && cursor.deltaY <= 1,
          "Selector center matches the selected coordinates without offset");
        const fieldSlider = page.locator(".pfx-picker__field");
        await fieldSlider.focus();
        const previousCursorPosition = await pickerPanel.locator(".pfx-picker__precision-cursor")
          .getAttribute("style");
        await fieldSlider.press("ArrowRight");
        await page.waitForFunction(previous =>
          document.querySelector(".pfx-picker__precision-cursor")?.getAttribute("style") !== previous,
          previousCursorPosition);
        await format.selectOption("rgb");
        await page.getByRole("button", { name: "Copy RGB" }).click();
        assert.match(await page.evaluate(() => window.__PFX_COPIED__), /^rgb\(/,
          "RGB format copies live color");
        const red = page.getByRole("spinbutton", { name: "Red channel" });
        await red.fill("120");
        await red.press("Enter");
        await page.waitForFunction(() =>
          document.querySelector('input[aria-label="Current color"]')?.value.toLowerCase().slice(1,3) === "78",
          null, { timeout: 5000 });
        await format.selectOption("hex");
        await valueField.fill("#336699");
        await valueField.press("Enter");
        await page.waitForFunction(() =>
          document.querySelector('input[aria-label="Current color"]')?.value.toLowerCase() === "#336699");
        await valueField.fill("#gggggg");
        await valueField.press("Enter");
        assert.equal(await valueField.getAttribute("aria-invalid"), "true",
          "Invalid color is rejected");
        await valueField.press("Escape");
        assert.equal(await valueField.getAttribute("aria-invalid"), "false");
        assert.equal((await currentInput.inputValue()).toLowerCase(), "#336699");
        await format.selectOption("hsl");
        assert.match(await valueField.inputValue(), /^hsl\(/);
        await format.selectOption("oklch");
        assert.match(await valueField.inputValue(), /^oklch\(/);
        await page.getByRole("button", { name: "Copy OKLCH" }).click();
        assert.match(await page.evaluate(() => window.__PFX_COPIED__), /^oklch\(/);
        await format.selectOption("hex");
        const hueRail = page.getByRole("slider", { name: "Hue", exact: true });
        await hueRail.focus();
        const saturationTrackBefore = await page.locator(".pfx-picker__rail--saturation").evaluate(el =>
          getComputedStyle(el).getPropertyValue("--pfx-rail-gradient").trim());
        await hueRail.press("ArrowRight");
        const saturationTrackAfter = await page.locator(".pfx-picker__rail--saturation").evaluate(el =>
          getComputedStyle(el).getPropertyValue("--pfx-rail-gradient").trim());
        assert.notEqual(saturationTrackAfter, saturationTrackBefore,
          "Saturation artwork follows Hue changes");
        await page.getByRole("slider", { name: "Opacity" }).focus();
        await page.getByRole("slider", { name: "Opacity" }).press("Home");
        await page.getByRole("button", { name: "Copy HEX" }).click();
        assert.match(await page.evaluate(() => window.__PFX_COPIED__), /^#[0-9A-F]{8}$/,
          "Transparent colors retain alpha channel");
        await page.getByRole("slider", { name: "Opacity" }).press("End");
        await page.getByRole("button", { name: "Save color" }).click();
        await page.screenshot({ path: `browser-evidence/workspace-v2/${browserName}-${viewport.width}-picker.png`, animations: "disabled" });

        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Explore" }).click();
        await page.locator(".pfx-explore__viewport").waitFor();
        assert.equal(await page.locator(".pfx-explore__chip").count(), 148,
          "Explore shows all documented CSS color keywords");
        assert.equal(await page.locator(".pfx-explore__inspector, .pfx-explore__atlas-tile, .pfx-explore__wheel").count(), 0,
          "Complex discovery tools are not present in first Explore version");
        const search = page.getByRole("searchbox", { name: "Search named colors" });
        await search.fill("royal blue");
        await page.getByRole("button", { name: "Select Royal Blue #4169E1" }).click();
        await page.waitForFunction(() =>
          document.querySelector('input[aria-label="Current color"]')?.value?.toLowerCase() === "#4169e1");
        await search.fill("#ff6347");
        assert.equal(await page.locator(".pfx-explore__chip").count(), 1);
        await page.getByRole("button", { name: "Select Tomato #FF6347" }).click();
        await page.waitForFunction(() =>
          document.querySelector('input[aria-label="Current color"]')?.value?.toLowerCase() === "#ff6347");
        await search.fill("");
        assert.equal(await page.locator(".pfx-explore__chip").count(), 148);
        await page.screenshot({ path: "browser-evidence/workspace-v2/" + browserName + "-" + viewport.width + "-explore.png", animations: "disabled" });
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Tones" }).click();
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
        const laterSearch = page.getByRole("searchbox", { name: "Search named colors" });
        await laterSearch.fill("rebecca");
        await page.getByRole("button", { name: "Select Rebecca Purple #663399" }).click();
        await page.waitForFunction(() =>
          document.querySelector('input[aria-label="Current color"]')?.value?.toLowerCase() === "#663399");
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
        assert.deepEqual(await page.locator(".pfx-home__code").allTextContents(), generatedPalette,
          "Quick Palette survives reload");
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Explore" }).click();
        assert.equal(await page.locator(".pfx-explore__chip").count(), 148,
          "Named colors catalog survives reload");
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
