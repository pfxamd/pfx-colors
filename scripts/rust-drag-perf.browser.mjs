import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, firefox } from "playwright";

const origin = process.env.PFX_COLORS_URL ?? "http://127.0.0.1:4173/";
mkdirSync("browser-evidence/rust-regression", { recursive: true });

for (const [browserName, engine] of [["chromium", chromium], ["firefox", firefox]]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      try {
        const url = new URL(origin);
        url.searchParams.set("engine", "rust");
        const response = await page.goto(url.toString(), { waitUntil: "networkidle" });
        assert.equal(response?.status(), 200);
        await page.locator('nav[aria-label="Color tools"] button')
          .filter({ hasText: "Gradient" }).click();
        await page.locator('canvas[data-rust-gradient-preview="ready"]')
          .waitFor({ timeout: 30000 });
        const initial = await page.evaluate(() => ({
          ...window.__PFX_RUST_RENDER__,
          angle: document.querySelector(".pfx-c-gradient-preview__angle")?.textContent,
        }));
        assert.equal(initial.worker, true, "Gradient painting must run on a dedicated worker");
        assert.ok(initial.completed > 0, "Real Rust pixel job must have finished");

        await page.evaluate(() => {
          const collector = { frames: [], start: performance.now(), active: true };
          window.__PFX_DRAG_FRAMES__ = collector;
          let last = performance.now();
          const tick = now => {
            if (!collector.active) return;
            collector.frames.push(now - last);
            last = now;
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });

        const preview = await page.locator(".pfx-c-gradient-preview").boundingBox();
        const grip = await page.getByRole("button", { name: "Rotate gradient from end" }).boundingBox();
        assert.ok(preview && grip);
        const cx = preview.x + preview.width / 2;
        const cy = preview.y + preview.height / 2;
        const distance = Math.min(preview.width, preview.height) * 0.28;
        await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
        await page.mouse.down();
        for (let i = 0; i < 45; i++) {
          const angle = (Math.PI * 1.85 * (i + 1)) / 45;
          await page.mouse.move(cx + distance * Math.cos(angle),
            cy + distance * Math.sin(angle));
        }
        await page.mouse.up();

        // React / ResizeObserver may commit one more geometry revision after
        // the final mouse event. Require the newest frame to stay current for
        // a settling window rather than passing on a transient match.
        await page.waitForFunction(previous => {
          const stats = window.__PFX_RUST_RENDER__;
          const caughtUp = stats?.latestRevision > previous
            && stats?.paintRevision === stats?.latestRevision
            && document.querySelector('canvas[data-rust-gradient-preview]')?.dataset
              .rustGradientPreview === "ready";
          if (!caughtUp) {
            window.__PFX_STABLE_FRAME__ = null;
            return false;
          }
          if (window.__PFX_STABLE_FRAME__?.revision !== stats.latestRevision) {
            window.__PFX_STABLE_FRAME__ = { revision: stats.latestRevision, since: performance.now() };
            return false;
          }
          return performance.now() - window.__PFX_STABLE_FRAME__.since >= 180;
        }, initial.latestRevision, { timeout: 30000 });

        const outcome = await page.evaluate(() => {
          window.__PFX_DRAG_FRAMES__.active = false;
          const deltas = window.__PFX_DRAG_FRAMES__.frames.slice(1);
          deltas.sort((a, b) => a - b);
          const stats = window.__PFX_RUST_RENDER__;
          return {
            frames: deltas.length,
            p95FrameMs: deltas[Math.floor((deltas.length - 1) * .95)] ?? 0,
            maxFrameMs: deltas.at(-1) ?? 0,
            angle: document.querySelector(".pfx-c-gradient-preview__angle")?.textContent,
            ...stats,
          };
        });
        assert.notEqual(outcome.angle, initial.angle, "Trusted drag must change the actual gradient angle");
        assert.ok(outcome.frames >= 10, "Animation frames must continue during dragging");
        assert.ok(outcome.p95FrameMs < 150, "Main-thread animation p95 is too slow: " + JSON.stringify(outcome));
        assert.ok(outcome.maxFrameMs < 500, "Main-thread stalled: " + JSON.stringify(outcome));
        assert.equal(outcome.paintRevision, outcome.latestRevision,
          "Final paint must use the latest drag revision");
        assert.ok(outcome.latestRevision > initial.latestRevision);
        // Preview must advance repeatedly during the pointer gesture, not
        // freeze until the final request finally matches the current state.
        assert.ok(outcome.painted >= initial.painted + 5,
          "Rust gradient preview did not advance during drag: " + JSON.stringify(outcome));
        assert.deepEqual(errors, [], "No runtime errors during drag");
        await page.screenshot({
          path: "browser-evidence/rust-regression/drag-" + browserName +
            "-" + viewport.width + ".png", animations: "disabled",
        });
        console.log("RUST DRAG PERF PASS", browserName, viewport.width + "x" +
          viewport.height, JSON.stringify(outcome));
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
console.log("PFx Rust worker sustained drag performance: PASS");
