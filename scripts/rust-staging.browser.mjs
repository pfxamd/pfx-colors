/**
 * Verify the deployable staging-dist/ bytes, not the developer preview.
 * Every case uses a real compiled Rust WASM build, not a mocked engine.
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, firefox } from "playwright";

const origin = process.env.PFX_STAGING_URL ?? "http://127.0.0.1:4175/";
const folder = "browser-evidence/rust-staging";
mkdirSync(folder, { recursive: true });

for (const [name, type] of [["chromium", chromium], ["firefox", firefox]]) {
  const browser = await type.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      try {
        const response = await page.goto(origin, { waitUntil: "networkidle", timeout: 60000 });
        assert.equal(response?.status(), 200);
        assert.equal(await page.locator(".pfx-c-engine-label").getAttribute("data-engine"), "rust");
        const bar = page.locator("#pfx-rust-staging-bar");
        assert.ok(await bar.isVisible(), "Staging banner should be visible");
        assert.match(await bar.textContent(), /Rust preview/);
        assert.equal(await page.locator(".pfx-c-study__swatch").count(), 10);
        await page.locator('nav[aria-label="Color tools"] button')
          .filter({ hasText: "Gradient" }).click();
        await page.locator('canvas[data-rust-gradient-preview="ready"]')
          .waitFor({ timeout: 30000 });
        const stats = await page.evaluate(() => window.__PFX_RUST_RENDER__);
        assert.ok(stats?.worker && stats.painted > 0);
        const meta = await page.locator('meta[name="robots"]').getAttribute("content");
        assert.match(meta, /noindex/);
        const manifest = await (await context.request.get(new URL("preview-info/build.json", origin).href)).json();
        assert.equal(manifest.engineDefault, "rust");
        assert.equal(manifest.productionModified, false);
        const robots = await (await context.request.get(new URL("robots.txt", origin).href)).text();
        assert.ok(robots.includes("Disallow: " + manifest.hostingBase));
        await page.screenshot({
          path: folder + "/" + name + "-" + viewport.width + "-rust.png",
          animations: "disabled",
        });

        const wasmRequests = [];
        page.on("request", request => {
          if (request.url().endsWith("/pfx_color_ffi.wasm")) wasmRequests.push(request.url());
        });
        await bar.getByRole("link", { name: "TypeScript" }).click();
        await page.locator(".pfx-c-engine-label[data-engine='legacy']")
          .waitFor({ state: "attached" });
        assert.equal(await page.locator(".pfx-c-study__swatch").count(), 10);
        assert.deepEqual(wasmRequests, [],
          "Legacy switch must not load the experimental Rust WASM");
        assert.ok(await page.locator("#pfx-rust-staging-bar").isVisible());
        assert.deepEqual(errors, []);
        await page.screenshot({
          path: folder + "/" + name + "-" + viewport.width + "-legacy.png",
          animations: "disabled",
        });
        console.log("STAGING PASS", name, viewport.width + "x" + viewport.height,
          "Rust default + WebAssembly canvas + explicit legacy switch + noindex");
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
console.log("PFx independent Rust staging validation: PASS");
