import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, firefox } from "playwright";

const origin = process.env.PFX_COLORS_URL ?? "http://127.0.0.1:4173/";
const evidence = "browser-evidence/rust-experiment";
mkdirSync(evidence, { recursive: true });

async function scenario(browser, browserName, viewport, engine) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  const failures = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    if (response.status() >= 400 && response.url().includes("/rust/")) {
      failures.push(response.status() + " " + response.url());
    }
  });
  try {
    const started = performance.now();
    const url = new URL(origin);
    if (engine === "rust") url.searchParams.set("engine", "rust");
    const response = await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 60000 });
    assert.equal(response?.status(), 200);
    await page.locator(".pfx-c-study__swatch").first().waitFor();
    const bootMs = performance.now() - started;
    assert.equal(await page.locator(".pfx-c-study__swatch").count(), 10);
    assert.equal(await page.locator(".pfx-c-engine-label").getAttribute("data-engine"), engine);
    const current = page.locator('input[aria-label="Current color"]');
    await current.fill("#336699");
    await current.press("Enter");
    assert.equal((await current.inputValue()).toLowerCase(), "#336699", engine + ": hex selection");
    await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Picker" }).click();
    await page.locator(".pfx-c-workbench--picker").waitFor();
    const picker = await current.inputValue();
    assert.equal(picker.toLowerCase(), "#336699");
    const pickerControl = page.locator('.pfx-c-console input[type="range"]').first();
    await pickerControl.focus();
    await pickerControl.press("ArrowRight");
    // Use genuine keyboard input, not synthesized DOM events, and await
    // React's state commit before recording the undo baseline.
    await page.waitForFunction(previous =>
      document.querySelector('input[aria-label="Current color"]')?.value !== previous,
      picker);
    const afterPicker = await current.inputValue();
    await page.screenshot({ path: evidence + "/" + browserName + "-" + viewport.width + "-" + engine + "-picker.png", animations: "disabled" });
    await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Palette" }).click();
    await page.locator(".pfx-c-workbench--palette").waitFor();
    assert.equal(await page.locator(".pfx-c-palette-ribbon button").count(), 9);
    const paletteHexes = await page.locator(".pfx-c-palette-ribbon button span").allTextContents();
    await page.locator(".pfx-c-palette-ribbon button").nth(2).click();
    const selectedSwatch = paletteHexes[2].trim().toLowerCase();
    await page.waitForFunction(expected =>
      document.querySelector('input[aria-label="Current color"]')?.value.toLowerCase() === expected,
      selectedSwatch);
    const fromPalette = await current.inputValue();
    assert.match(fromPalette, /^#[0-9a-f]{6}$/i);
    await page.getByRole("button", { name: /UNDO/ }).click();
    await page.waitForFunction(expected =>
      document.querySelector('input[aria-label="Current color"]')?.value === expected,
      afterPicker);
    const undone = await current.inputValue();
    assert.equal(undone, afterPicker, "undo must restore the prior picked color");
    await page.getByRole("button", { name: /REDO/ }).click();
    await page.waitForFunction(expected =>
      document.querySelector('input[aria-label="Current color"]')?.value === expected,
      fromPalette);
    assert.equal(await current.inputValue(), fromPalette, "redo must recover palette selection");
    await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Harmony" }).click();
    await page.locator(".pfx-c-workbench--harmony").waitFor();
    const harmonyCount = await page.locator('[aria-label^="Drag harmony color "]').count();
    assert.ok(harmonyCount >= 2);
    await page.locator(".pfx-c-harmony-presets button[aria-label='complementary']").click();
    assert.equal(await page.locator('[aria-label^="Drag harmony color "]').count(), 2);
    await page.getByRole("button", { name: /Send harmony to gradient/i }).click();
    await page.locator(".pfx-c-workbench--gradient").waitFor();
    assert.ok((await page.locator(".pfx-c-gradient-stop-handle").count()) >= 2);
    await page.locator(".pfx-c-gradient-actions button[aria-label='Add gradient stop']").click();
    const stopsAfterAdding = await page.locator(".pfx-c-gradient-stop-handle").count();
    assert.ok(stopsAfterAdding >= 3);
    await page.getByRole("button", { name: /UNDO/ }).click();
    const undoGradient = await current.inputValue();
    await page.getByRole("button", { name: /REDO/ }).click();
    const redoGradient = await current.inputValue();
    assert.equal(undoGradient, redoGradient, "gradient edit undo/redo keeps selected color");
    if (engine === "rust") {
      // Take the pixel and revision snapshot atomically: an observer may
      // schedule another worker frame between separate Playwright calls.
      const sampledHandle = await page.waitForFunction(() => {
        const stats = window.__PFX_RUST_RENDER__;
        const canvas = document.querySelector('canvas[data-rust-gradient-preview="ready"]');
        if (!stats || !canvas || canvas.width <= 0 || canvas.height <= 0 ||
          stats.paintRevision !== stats.latestRevision) return false;
        const ctx = canvas.getContext("2d");
        const image = ctx?.getImageData(0, 0, canvas.width, canvas.height).data;
        return {
          counts: { ...window.__PFX_RUST_OPS__ },
          width: canvas.width, height: canvas.height,
          alphaAtCenter: image ? image[
            (Math.floor(canvas.height / 2) * canvas.width +
              Math.floor(canvas.width / 2)) * 4 + 3
          ] : -1,
        };
      }, null, { timeout: 30000 });
      const sampled = await sampledHandle.jsonValue();
      for (const operation of [
        "study", "tonal", "harmony", "gradientCreate", "gradientSample",
        "gradientRaster", "convert", "formatHex",
      ]) {
        assert.ok(sampled.counts?.[operation] > 0,
          "Real Rust WASM operation not exercised: " + operation + " " + JSON.stringify(sampled));
      }
      assert.equal(sampled.width, 160);
      assert.ok(sampled.height > 0 && sampled.height <= 180);
      assert.ok(sampled.alphaAtCenter > 0);
    } else {
      assert.equal(await page.evaluate(() => window.__PFX_RUST_OPS__), undefined);
      assert.equal(await page.locator('canvas[data-rust-gradient-preview]').count(), 0);
    }
    await page.screenshot({ path: evidence + "/" + browserName + "-" + viewport.width + "-" + engine + "-gradient.png", animations: "disabled" });
    assert.deepEqual(failures, [], engine + " asset failures");
    assert.deepEqual(errors, [], engine + " runtime errors");
    const result = {
      engine, bootMs: Math.round(bootMs), picker, afterPicker,
      paletteHexes, fromPalette, stopsAfterAdding, harmonyCount,
      undoGradient, redoGradient,
    };
    console.log(browserName, viewport.width + "x" + viewport.height, engine,
      "PASS", JSON.stringify({ bootMs: result.bootMs, palette: paletteHexes.length, stops: stopsAfterAdding }));
    return result;
  } finally {
    await context.close();
  }
}

function closeHex(a, b, tolerance = 2) {
  const channels = value => {
    const hex = value.replace(/^#/, "");
    if (hex.length !== 6) return [];
    return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  };
  const left = channels(a);
  const right = channels(b);
  assert.equal(left.length, 3, a);
  assert.equal(right.length, 3, b);
  left.forEach((c, i) => assert.ok(Math.abs(c - right[i]) <= tolerance,
    "Color parity differs: " + a + " vs " + b + " channel " + i));
}

for (const [browserName, kind] of [["chromium", chromium], ["firefox", firefox]]) {
  const browser = await kind.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const legacy = await scenario(browser, browserName, viewport, "legacy");
      const rust = await scenario(browser, browserName, viewport, "rust");
      closeHex(legacy.picker, rust.picker);
      closeHex(legacy.afterPicker, rust.afterPicker);
      // Both app branches still generate their displayed palette swatches
      // through the original standalone tool; backend differs on selection.
      assert.equal(legacy.paletteHexes.length, rust.paletteHexes.length);
      legacy.paletteHexes.forEach((hex, i) => closeHex(hex, rust.paletteHexes[i], 3));
      closeHex(legacy.fromPalette, rust.fromPalette, 3);
      assert.equal(legacy.stopsAfterAdding, rust.stopsAfterAdding);
      console.log(browserName, viewport.width + "x" + viewport.height,
        "parity PASS", "startup (ms) legacy/Rust:", legacy.bootMs, rust.bootMs);
    }
  } finally {
    await browser.close();
  }
}
console.log("PFx real React Rust workspace experiment: PASS");
