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

        // Run a second sustained gesture through the periodic Conic path.
        // Its render-only color samples must not stall the main thread.
        await page.getByRole("button", { name: "conic gradient" }).click();
        await page.locator('canvas[data-rust-gradient-preview="ready"]')
          .waitFor({ timeout: 30000 });
        const conicHandle = page.getByRole("button", { name: "Rotate conic gradient" });
        await conicHandle.scrollIntoViewIfNeeded();
        // Selecting Conic scrolls the inspector on some Firefox mobile layouts.
        // Re-measure the preview instead of reusing coordinates from Linear.
        const conicPreview = await page.locator(".pfx-c-gradient-preview").boundingBox();
        const conicGrip = await conicHandle.boundingBox();
        assert.ok(conicGrip && conicPreview, "Conic drag handle and preview exist");
        const conicCx = conicPreview.x + conicPreview.width / 2;
        const conicCy = conicPreview.y + conicPreview.height / 2;
        const conicDistance = Math.min(conicPreview.width, conicPreview.height) * 0.28;
        const conicBefore = await page.evaluate(() => ({ ...window.__PFX_RUST_RENDER__ }));
        await page.evaluate(() => {
          const frames = { times: [], active: true };
          window.__PFX_CONIC_FRAMES__ = frames;
          let prior = performance.now();
          const tick = now => {
            if (!frames.active) return;
            frames.times.push(now - prior);
            prior = now;
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        await page.mouse.move(conicGrip.x + conicGrip.width / 2,
          conicGrip.y + conicGrip.height / 2);
        await page.mouse.down();
        for (let i = 0; i < 45; i++) {
          const radians = 2 * Math.PI * (i + 1) / 45;
          await page.mouse.move(conicCx + conicDistance * Math.sin(radians),
            conicCy - conicDistance * Math.cos(radians));
        }
        await page.mouse.up();
        const conicAfterInput = await page.evaluate(() => ({
          stats: { ...window.__PFX_RUST_RENDER__ },
          angle: document.querySelector(".pfx-c-gradient-preview__angle")?.textContent,
          canvas: document.querySelector("canvas[data-rust-gradient-preview]")?.dataset
            .rustGradientPreview,
        }));
        console.log("CONIC AFTER INPUT", browserName, viewport.width, JSON.stringify({
          startRevision: conicBefore.latestRevision,
          after: conicAfterInput, grip: conicGrip,
        }));
        await page.waitForFunction(previous => {
          const stats = window.__PFX_RUST_RENDER__;
          const settled = stats?.latestRevision > previous &&
            stats.paintRevision === stats.latestRevision &&
            document.querySelector('canvas[data-rust-gradient-preview]')?.dataset
              .rustGradientPreview === "ready";
          if (!settled) {
            window.__PFX_CONIC_STABLE__ = null;
            return false;
          }
          if (window.__PFX_CONIC_STABLE__?.revision !== stats.latestRevision) {
            window.__PFX_CONIC_STABLE__ = { revision: stats.latestRevision, since: performance.now() };
            return false;
          }
          return performance.now() - window.__PFX_CONIC_STABLE__.since >= 180;
        }, conicBefore.latestRevision, { timeout: 30000 });
        const conic = await page.evaluate(() => {
          const collector = window.__PFX_CONIC_FRAMES__;
          collector.active = false;
          const times = collector.times.slice(1).sort((a, b) => a - b);
          return {
            frames: times.length,
            p95FrameMs: times[Math.floor((times.length - 1) * 0.95)] ?? 0,
            maxFrameMs: times.at(-1) ?? 0,
            ...window.__PFX_RUST_RENDER__,
          };
        });
        assert.ok(conic.frames >= 10, "Conic interaction must continue producing animation frames");
        assert.ok(conic.p95FrameMs < 150,
          "Conic pointer frame p95 exceeded budget: " + JSON.stringify(conic));
        assert.ok(conic.maxFrameMs < 500,
          "Conic pointer stalled the main thread: " + JSON.stringify(conic));
        assert.ok(conic.painted > conicBefore.painted,
          "Conic gradient has not delivered a newly rendered frame");
        assert.equal(conic.paintRevision, conic.latestRevision,
          "Conic gradient has not finished painting the current revision");
        assert.deepEqual(errors, [], "Conic drag must not produce runtime errors");
        await page.screenshot({
          path: "browser-evidence/rust-regression/conic-drag-" + browserName +
            "-" + viewport.width + ".png", animations: "disabled",
        });
        console.log("CONIC DRAG PERF PASS", browserName, viewport.width + "x" +
          viewport.height, JSON.stringify(conic));
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
console.log("PFx Rust worker sustained drag performance: PASS");
