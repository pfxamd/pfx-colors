/**
 * Continuous browser regression for the production Rust engine and rollback.
 * Runs against actual Vite dist at the final GitHub Pages project subpath.
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, firefox } from "playwright";

const origin = process.env.PFX_COLORS_URL ?? "http://127.0.0.1:4173/pfx-colors/";
const folder = "browser-evidence/rust-production";
mkdirSync(folder, { recursive: true });

const toUrl = mode => {
  const url = new URL(origin);
  if (mode) url.searchParams.set("engine", mode);
  return url.toString();
};

for (const [browserName, launcher] of [["chromium", chromium], ["firefox", firefox]]) {
  const browser = await launcher.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      try {
        const response = await page.goto(toUrl(null), { waitUntil: "networkidle", timeout: 60000 });
        assert.equal(response?.status(), 200);
        await page.locator(".pfx-c-engine-label[data-engine='rust']").waitFor({
          state: "attached", timeout: 30000,
        });
        await page.locator(".pfx-home__study-swatches button").first().waitFor();
        assert.equal(await page.locator(".pfx-home__study-swatches button").count(), 10);
        assert.equal(await page.locator(".pfx-c-engine-label").textContent(), "RUST / CORE");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
          "No horizontal overflow in production preview");
        for (const name of ["Picker", "Tones", "Harmony", "Gradient"]) {
          await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: name }).click();
          if (name === "Gradient") {
            await page.locator('canvas[data-rust-gradient-preview="ready"]').waitFor({ timeout: 30000 });
            assert.equal(await page.evaluate(() => window.__PFX_RUST_RENDER__?.worker), true);
          }
        }
        assert.deepEqual(errors, [], browserName + ": Rust must not cause page exceptions");
        await page.screenshot({
          path: `${folder}/${browserName}-${viewport.width}-default-rust.png`,
          animations: "disabled",
        });
        const legacy = await context.newPage();
        const wasmRequests = [];
        const legacyErrors = [];
        legacy.on("request", request => {
          if (request.url().endsWith("/pfx_color_ffi.wasm")) wasmRequests.push(request.url());
        });
        legacy.on("pageerror", error => legacyErrors.push(error.message));
        await legacy.goto(toUrl("legacy"), { waitUntil: "networkidle", timeout: 60000 });
        await legacy.locator(".pfx-c-engine-label[data-engine='legacy']").waitFor({ state: "attached" });
        await legacy.locator(".pfx-home__study-swatches button").first().waitFor();
        await legacy.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Gradient" }).click();
        assert.equal(await legacy.locator(".pfx-c-gradient-preview").count(), 1);
        assert.equal(await legacy.locator("canvas[data-rust-gradient-preview]").count(), 0);
        assert.deepEqual(wasmRequests, [], "Legacy rollback must not fetch Rust engine");
        assert.deepEqual(legacyErrors, [], "Legacy rollback must not produce exceptions");
        await legacy.screenshot({
          path: `${folder}/${browserName}-${viewport.width}-legacy.png`,
          animations: "disabled",
        });
        await legacy.close();

        // Force a network failure while bootstrapping production Rust.
        // A broken WASM download must not blank the original application.
        const failed = await context.newPage();
        const blocked = [];
        await failed.route("**/rust/pfx_color_ffi.wasm", route => {
          blocked.push(route.request().url());
          return route.fulfill({ status: 503, contentType: "application/wasm", body: "unavailable" });
        });
        await failed.goto(toUrl(null), { waitUntil: "networkidle", timeout: 60000 });
        await failed.locator(".pfx-c-engine-label[data-engine='legacy']").waitFor({
          state: "attached", timeout: 30000,
        });
        assert.ok(blocked.length >= 1, "Test must actually intercept and reject WASM");
        assert.equal(await failed.locator(".pfx-home__study-swatches button").count(), 10);
        assert.equal(await failed.evaluate(() => document.documentElement.dataset.pfxEngineFallback), "legacy");
        await failed.close();
        console.log("PRODUCTION RUST ACCEPT PASS", browserName,
          viewport.width + "x" + viewport.height,
          "Rust default, all tools, legacy rollback, forced WASM outage recovery");
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
console.log("Rust production browser regression: PASS");
