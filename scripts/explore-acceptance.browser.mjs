/**
 * Comprehensive Explore acceptance test in REAL Chromium and Firefox browsers.
 * Verifies user-visible behavior in desktop/mobile and both color schemes.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, firefox } from "playwright";

const base = process.env.PFX_COLORS_URL ?? "http://127.0.0.1:4173/pfx-colors/";
const output = "browser-evidence/explore-acceptance";
mkdirSync(output, { recursive: true });

const results = [];
const failures = [];
const nav = 'nav[aria-label="Color tools"] button';
const active = 'input[aria-label="Current color"]';
const getHex = async page => (await page.locator(active).inputValue()).toLowerCase();
const waitHex = (page, hex) => page.waitForFunction(
  expected => document.querySelector('input[aria-label="Current color"]')?.value?.toLowerCase() === expected,
  hex.toLowerCase(), { timeout: 8000 },
);
async function openTool(page, name) {
  await page.locator(nav).filter({ hasText: name }).click();
}
async function explore(page) {
  await openTool(page, "Explore");
  await page.locator(".pfx-explore__browse-grid").waitFor();
}
async function locate(page, hex) {
  await explore(page);
  const search = page.getByRole("searchbox", { name: "Search a color name or exact HEX" });
  await search.fill(hex);
  await page.locator(".pfx-explore__searchform button[type=submit]").click();
  await waitHex(page, hex);
}
const colorOf = (page, selector) => page.locator(selector).evaluate(el => getComputedStyle(el).backgroundColor);
async function setRange(range, value) {
  await range.evaluate((element, next) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(element, String(next));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    // A user release commits the continuous preview to shared color history.
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  }, value);
}

for (const [browserName, launcher] of [["chromium", chromium], ["firefox", firefox]]) {
  const browser = await launcher.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { writeText: async text => { window.__PFX_COPIED__ = text; } },
        });
        if (!sessionStorage.getItem("pfx-explore-qa-seeded")) {
          localStorage.setItem("pfx-colors.current", "#010101");
          sessionStorage.setItem("pfx-explore-qa-seeded", "yes");
        }
      });
      const errors = [];
      page.on("pageerror", err => errors.push(err.message));
      const prefix = browserName + "/" + viewport.width;
      async function check(label, test) {
        try {
          await test();
          results.push({ browser: browserName, viewport: viewport.width, test: label, result: "PASS" });
          console.log("PASS", prefix, label);
        } catch (error) {
          const message = String(error?.stack || error);
          failures.push({ browser: browserName, viewport: viewport.width, test: label, error: message });
          results.push({ browser: browserName, viewport: viewport.width, test: label, result: "FAIL", error: message });
          console.error("FAIL", prefix, label, message);
          try {
            await page.screenshot({
              path: output + "/" + browserName + "-" + viewport.width + "-" + label.replaceAll(/[^a-z0-9]/gi, "-") + ".png",
              fullPage: true, animations: "disabled",
            });
            await page.reload({ waitUntil: "networkidle" });
          } catch (recoveryError) {
            console.error("Recovery failed", String(recoveryError));
          }
        }
      }
      try {
        const response = await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
        assert.equal(response?.status(), 200);

        await check("First entry lifts inherited near-black into useful color", async () => {
          await explore(page);
          await waitHex(page, "#4778d6");
          assert.equal((await page.locator(".pfx-explore__inspector-ident button").innerText()).includes("#4778D6"), true);
          assert.equal(await colorOf(page, ".pfx-explore__inspector-color"), "rgb(71, 120, 214)");
          const inspector = page.locator(".pfx-explore__inspector");
          assert.ok(await inspector.isVisible());
        });

        await check("Primary color grid renders without opening advanced controls", async () => {
          await explore(page);
          const grid = page.locator(".pfx-explore__browse-grid");
          assert.equal(await grid.locator(".pfx-explore__browse-cell").count(), 96);
          assert.equal(await page.locator("#explore-refine").getAttribute("open"), null);
          assert.equal(await page.locator("#explore-rgb-atlas").getAttribute("open"), null);
          const first = grid.locator(".pfx-explore__browse-cell").first();
          const initialGrid = await grid.locator(".pfx-explore__browse-cell-foot code").allTextContents();
          const chosen = "#" + (await first.locator(".pfx-explore__browse-cell-foot code").innerText()).toLowerCase();
          await first.locator(".pfx-explore__browse-color").click();
          await waitHex(page, chosen);
          const selected = await getHex(page);
          assert.match(selected, /^#[0-9a-f]{6}$/);
          assert.deepEqual(await grid.locator(".pfx-explore__browse-cell-foot code").allTextContents(), initialGrid,
            "Selecting a shade must not shuffle the grid");
          assert.equal(await colorOf(page, ".pfx-explore__inspector-color"),
            await colorOf(page, ".pfx-explore__browse-picked > span"), "Inspector and selection bar stay in sync");
          await first.locator(".pfx-explore__browse-cell-foot button").click();
          assert.equal(await page.evaluate(() => window.__PFX_COPIED__), selected.toUpperCase());
          await page.locator(".pfx-explore__browse-actions").getByRole("button", {name:"Copy HEX"}).click();
          assert.equal(await page.evaluate(() => window.__PFX_COPIED__), selected.toUpperCase());
        });

        await check("Browse family changes swatches without opening tuning controls", async () => {
          await explore(page);
          const before = await page.locator(".pfx-explore__browse-cell-foot code").first().innerText();
          await page.getByRole("group", {name:"Browse color families"}).getByRole("button", {name:"Red"}).click();
          const after = await page.locator(".pfx-explore__browse-cell-foot code").first().innerText();
          assert.notEqual(after,before);
          assert.equal(await page.getByRole("group", {name:"Browse color families"})
            .getByRole("button", {name:"Red"}).getAttribute("aria-pressed"),"true");
          await page.getByRole("group", {name:"Browse color families"}).getByRole("button", {name:"Neutral"}).click();
          assert.equal(await page.locator(".pfx-explore__browse-cell").count(),8);
          await page.getByRole("group", {name:"Browse color families"}).getByRole("button", {name:"Blue"}).click();
          assert.equal(await page.locator(".pfx-explore__browse-cell").count(),96);
        });

        await check("Exact black and white are selectable with accurate inspector values", async () => {
          await locate(page, "#000000");
          assert.equal(await colorOf(page, ".pfx-explore__inspector-color"), "rgb(0, 0, 0)");
          assert.match(await page.locator(".pfx-explore__inspector-values").innerText(), /0, 0, 0/);
          await locate(page, "#ffffff");
          assert.equal(await colorOf(page, ".pfx-explore__inspector-color"), "rgb(255, 255, 255)");
          await locate(page, "#010101");
          assert.equal(await getHex(page), "#010101");
        });

        await check("Search offers named CSS colors and resolves exact HEX", async () => {
          await explore(page);
          const search = page.getByRole("searchbox", { name: "Search a color name or exact HEX" });
          await search.fill("royal blue");
          await page.getByRole("button", { name: /Royal Blue/i }).click();
          await waitHex(page, "#4169e1");
          await search.fill("rebecca");
          await page.getByRole("button", { name: /Rebecca Purple/i }).click();
          await waitHex(page, "#663399");
          await search.fill("abc");
          await page.locator(".pfx-explore__searchform button[type=submit]").click();
          await waitHex(page, "#aabbcc");
        });

        await check("Invalid search leaves active color unchanged and reports no match", async () => {
          await locate(page, "#245d9a");
          const before = await getHex(page);
          const search = page.getByRole("searchbox", { name: "Search a color name or exact HEX" });
          await search.fill("this-is-not-a-color");
          await page.locator(".pfx-explore__searchform button[type=submit]").click();
          assert.equal(await getHex(page), before);
          assert.match(await page.locator(".pfx-explore__status").innerText(), /No matching name/);
        });

        await check("Color families and hue keyboard input recover from black", async () => {
          await explore(page);
          await page.locator("#explore-refine > summary").click();
          await locate(page, "#000000");
          await page.getByRole("group", { name: "Browse color families" }).getByRole("button", { name: "Blue" }).click();
          const blue = await getHex(page);
          assert.notEqual(blue, "#000000");
          assert.ok(parseInt(blue.slice(5), 16) > 130);
          await locate(page, "#010101");
          await page.getByRole("slider", { name: /Hue/ }).first().press("ArrowRight");
          const keyed = await getHex(page);
          assert.notEqual(keyed, "#010101");
          const wheel = page.locator(".pfx-explore__wheel");
          const rect = await wheel.boundingBox();
          assert.ok(rect);
          await wheel.click({ position: { x: rect.width / 2, y: 13 } });
          const pointer = await getHex(page);
          assert.notEqual(pointer, keyed);
          assert.ok(await page.locator(".pfx-explore__inspector-color").isVisible());
        });

        await check("Depth controls and surface actually update selected RGB", async () => {
          await explore(page);
          if ((await page.locator("#explore-refine").getAttribute("open")) === null) await page.locator("#explore-refine > summary").click();
          await locate(page, "#3478bc");
          const first = await getHex(page);
          const sliders = page.locator(".pfx-explore__depth-controls input[type=range]");
          assert.equal(await sliders.count(), 2);
          await sliders.nth(0).focus();
          await sliders.nth(0).press("ArrowRight");
          await page.waitForFunction(previous =>
            document.querySelector('input[aria-label="Current color"]')?.value?.toLowerCase() !== previous, first);
          const lighter = await getHex(page);
          await sliders.nth(1).focus();
          await sliders.nth(1).press("ArrowRight");
          await page.waitForFunction(previous =>
            document.querySelector('input[aria-label="Current color"]')?.value?.toLowerCase() !== previous, lighter);
          const lessChroma = await getHex(page);
          const canvas = page.locator(".pfx-explore__depth-map canvas");
          const dims = await canvas.boundingBox();
          assert.ok(dims && dims.width > 150);
          await canvas.click({ position: { x: dims.width * .22, y: dims.height * .35 } });
          await page.waitForFunction(previous => document.querySelector('input[aria-label="Current color"]')?.value?.toLowerCase() !== previous, lessChroma);
          assert.notEqual(await getHex(page), lessChroma);
          assert.match(await page.locator(".pfx-explore__depth-controls").innerText(), /Lightness/);
        });

        await check("Nearby shades select and copy actual color codes", async () => {
          await explore(page);
          if ((await page.locator("#explore-refine").getAttribute("open")) === null) await page.locator("#explore-refine > summary").click();
          await locate(page, "#397cbb");
          const items = page.locator(".pfx-explore__related-item");
          assert.ok(await items.count() >= 8);
          const proposed = "#" + (await items.first().locator(".pfx-explore__related-code").innerText()).toLowerCase();
          await items.first().locator(".pfx-explore__related-code").click();
          assert.equal((await page.evaluate(() => window.__PFX_COPIED__)), proposed.toUpperCase());
          await items.first().locator("button").first().click();
          await waitHex(page, proposed);
          const hex = await getHex(page);
          assert.equal(hex, proposed);
          assert.match(hex, /^#[0-9a-f]{6}$/);
        });

        await check("All four atlas levels drill to one exact RGB color", async () => {
          await explore(page);
          if ((await page.locator("#explore-rgb-atlas").getAttribute("open")) === null) await page.locator("#explore-rgb-atlas > summary").click();
          await explore(page);
          await page.getByRole("button", { name: "All RGB", exact: true }).click();
          assert.equal(await page.locator(".pfx-explore__atlas-tile").count(), 64);
          await page.locator(".pfx-explore__atlas-actions select").selectOption("rgb");
          for (let level = 2; level <= 4; level++) {
            await page.locator(".pfx-explore__atlas-open").nth(20).click();
            assert.match(await page.locator(".pfx-explore__atlas-meta").innerText(), new RegExp("LEVEL 0" + level));
            assert.equal(await page.locator(".pfx-explore__atlas-tile").count(), 64);
          }
          const exactButton = page.locator(".pfx-explore__atlas-open").nth(20);
          const label = await exactButton.getAttribute("aria-label");
          const hex = label?.match(/#[0-9a-f]{6}/i)?.[0]?.toLowerCase();
          assert.ok(hex, "Final tile must expose its exact HEX code");
          await exactButton.click();
          await waitHex(page, hex);
          await page.getByRole("button", { name: /Back/ }).click();
          assert.match(await page.locator(".pfx-explore__atlas-meta").innerText(), /LEVEL 03/);
        });

        await check("Atlas can locate a requested value inside its exact final tile", async () => {
          await explore(page);
          if ((await page.locator("#explore-rgb-atlas").getAttribute("open")) === null) await page.locator("#explore-rgb-atlas > summary").click();
          await locate(page, "#c57d2a");
          assert.match(await page.locator(".pfx-explore__atlas-meta").innerText(), /LEVEL 04/);
          const exact = page.locator(".pfx-explore__atlas-open[aria-label='Select exact color #c57d2a']");
          assert.equal(await exact.count(), 1);
          const activeTile = page.locator(".pfx-explore__atlas-tile.is-current");
          assert.ok(await activeTile.count() >= 1);
          await page.getByRole("button", { name: "All RGB", exact: true }).click();
          assert.match(await page.locator(".pfx-explore__atlas-meta").innerText(), /LEVEL 01/);
        });

        await check("HEX, RGB, HSL and OKLCH copy the correct data", async () => {
          await locate(page, "#123456");
          await page.locator(".pfx-explore__inspector-ident button").click();
          assert.equal(await page.evaluate(() => window.__PFX_COPIED__), "#123456");
          const values = page.locator(".pfx-explore__inspector-values > div");
          await values.nth(0).getByRole("button", { name: "Copy" }).click();
          assert.equal(await page.evaluate(() => window.__PFX_COPIED__), "rgb(18 52 86)");
          await values.nth(1).getByRole("button", { name: "Copy" }).click();
          assert.match(await page.evaluate(() => window.__PFX_COPIED__), /^hsl\(\d+ \d+% \d+%\)$/);
          await values.nth(2).getByRole("button", { name: "Copy" }).click();
          assert.match(await page.evaluate(() => window.__PFX_COPIED__), /^oklch\([\d.]+% [\d.]+ [\d.]+\)$/);
        });

        await check("WCAG contrast readout updates on both backgrounds", async () => {
          await locate(page, "#000000");
          const ratio = page.locator(".pfx-explore__contrast-top span");
          assert.equal(await ratio.innerText(), "21.00:1");
          await page.locator(".pfx-explore__contrast-bottom").getByRole("button", { name: "Black" }).click();
          assert.equal(await ratio.innerText(), "1.00:1");
          await locate(page, "#ffffff");
          assert.equal(await ratio.innerText(), "21.00:1");
        });

        await check("Pinned comparison reacts to later color selection", async () => {
          await locate(page, "#ff0000");
          await page.getByRole("button", { name: "Set reference" }).click();
          await locate(page, "#0000ff");
          const comparison = page.locator(".pfx-explore__comparison");
          assert.equal(await comparison.locator(".pfx-explore__comparison-swatches > div").count(), 2);
          assert.match(await comparison.locator(".pfx-explore__comparison-result").innerText(), /\d+\.\d+:1/);
          await comparison.getByRole("button", { name: "Update reference" }).click();
          assert.match(await comparison.innerText(), /REFERENCE #0000FF/);
        });

        await check("Saved favorite survives navigation and reload", async () => {
          await locate(page, "#8a65c3");
          const save = page.locator(".pfx-explore__inspector-head button");
          if ((await save.getAttribute("aria-pressed")) === "true") await save.click();
          await save.click();
          assert.equal(await save.getAttribute("aria-pressed"), "true");
          await openTool(page, "Collections");
          assert.equal(await page.locator(".pfx-v2__swatches").getByRole("button", { name: "Select #8a65c3" }).count(), 1);
          await page.reload({ waitUntil: "networkidle" });
          await openTool(page, "Collections");
          assert.equal(await page.locator(".pfx-v2__swatches").getByRole("button", { name: "Select #8a65c3" }).count(), 1);
        });

        await check("Picker and Tones receive the exact inspected color", async () => {
          await locate(page, "#7a38b6");
          await page.locator(".pfx-explore__inspector-links").getByRole("button", { name: /Open Picker/ }).click();
          await page.locator(".pfx-picker__field").waitFor();
          assert.equal(await getHex(page), "#7a38b6");
          await explore(page);
          await page.locator(".pfx-explore__inspector-links").getByRole("button", { name: /Create Tones/ }).click();
          await page.locator(".pfx-c-workbench--palette").waitFor();
          assert.equal(await getHex(page), "#7a38b6");
        });

        await check("Inspector stays compact and layouts work in both themes", async () => {
          await explore(page);
          for (const theme of ["light", "dark"]) {
            await page.getByRole("button", { name: theme + " theme" }).click();
            assert.equal(await page.locator(".pfx-v2").getAttribute("data-theme"), theme);
            const metrics = await page.evaluate(() => {
              const inspector = document.querySelector(".pfx-explore__inspector");
              const preview = document.querySelector(".pfx-explore__inspector-color");
              const page = document.querySelector(".pfx-explore");
              return {
                previewHeight: preview?.getBoundingClientRect().height,
                inspectorWidth: inspector?.getBoundingClientRect().width,
                viewportOverflow: document.documentElement.scrollWidth - innerWidth,
                pageOverflow: (page?.scrollWidth ?? 0) - (page?.clientWidth ?? 0),
              };
            });
            assert.ok(metrics.previewHeight >= 90 && metrics.previewHeight <= 150, "Preview should be compact");
            assert.ok(metrics.inspectorWidth <= (viewport.width === 390 ? 390 : 300));
            assert.ok(metrics.viewportOverflow <= 3, "No document horizontal overflow");
            assert.ok(metrics.pageOverflow <= 5, "No Explore horizontal overflow");
            await page.screenshot({ path: output + "/" + browserName + "-" + viewport.width + "-" + theme + ".png", animations: "disabled" });
          }
        });
        await check("No unhandled JavaScript errors", async () => { assert.deepEqual(errors, []); });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

writeFileSync(output + "/report.json", JSON.stringify({
  url: base, total: results.length, passed: results.filter(r => r.result === "PASS").length,
  failed: failures.length, results,
}, null, 2));
console.log("Explore acceptance:", results.length - failures.length, "/", results.length, "checks passed");
if (failures.length) {
  console.error("Failures:", failures.map(f => f.browser + "/" + f.viewport + ": " + f.test).join("; "));
  process.exitCode = 1;
}
