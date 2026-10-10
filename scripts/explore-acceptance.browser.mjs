/** Explore named-color catalog acceptance in Chromium and Firefox. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, firefox } from "playwright";

const base = process.env.PFX_COLORS_URL ?? "http://127.0.0.1:4173/pfx-colors/";
const output = "browser-evidence/explore-acceptance";
mkdirSync(output, { recursive: true });
const records = [];
const failures = [];

for (const [browserName, launcher] of [["chromium", chromium], ["firefox", firefox]]) {
  const browser = await launcher.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      await context.addInitScript(() => {
        localStorage.setItem("pfx-colors.current", localStorage.getItem("pfx-colors.current") ?? "#010101");
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { writeText: async text => { window.__PFX_COPIED__ = text; } },
        });
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const name = browserName + "/" + viewport.width;
      const current = page.locator('input[aria-label="Current color"]');
      const hex = async () => (await current.inputValue()).toLowerCase();
      const search = page.getByRole("searchbox", { name: "Search named colors" });
      const results = page.getByRole("region", { name: "Named color results" });
      const select = (title, value) => page.getByRole("button", { name: "Select " + title + " " + value.toUpperCase() });
      const waitHex = value => page.waitForFunction(expected =>
        document.querySelector('input[aria-label="Current color"]')?.value?.toLowerCase() === expected,
        value.toLowerCase(), { timeout: 8000 });
      async function check(title, fn) {
        try {
          await fn();
          records.push({ browser: browserName, viewport: viewport.width, test: title, result: "PASS" });
          console.log("PASS", name, title);
        } catch (error) {
          failures.push({ browser: browserName, viewport: viewport.width, test: title, error: String(error?.stack || error) });
          records.push({ browser: browserName, viewport: viewport.width, test: title, result: "FAIL" });
          console.error("FAIL", name, title, error);
          await page.screenshot({ path: output + "/" + browserName + "-" + viewport.width + "-failed.png", animations: "disabled" }).catch(() => {});
          await page.reload({ waitUntil: "networkidle" }).catch(() => {});
        }
      }
      try {
        const response = await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
        assert.equal(response?.status(), 200);
        await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Explore" }).click();
        await results.waitFor();

        await check("Only documented named CSS colors are rendered", async () => {
          assert.equal(await page.locator(".pfx-explore__chip").count(), 148);
          assert.equal(await page.locator(".pfx-explore__count").innerText(), "148 names");
          assert.equal(await page.locator(".pfx-explore__source").getAttribute("href"),
            "https://www.w3.org/TR/css-color-4/#named-colors");
          assert.equal(await page.locator(".pfx-explore__inspector, .pfx-explore__wheel, .pfx-explore__atlas-tile").count(), 0);
          assert.equal(await hex(), "#010101", "Opening Explore does not silently replace active color");
          const names = await page.locator(".pfx-explore__name").allTextContents();
          assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "en")));
        });

        await check("Only the results panel scrolls", async () => {
          const before = await page.locator(".pfx-explore__heading").boundingBox();
          const metrics = await page.evaluate(() => {
            const region = document.querySelector(".pfx-explore");
            const results = document.querySelector(".pfx-explore__viewport");
            return {
              pageOverflow: region.scrollHeight - region.clientHeight,
              documentOverflow: document.documentElement.scrollHeight - innerHeight,
              horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
              resultOverflow: results.scrollHeight - results.clientHeight,
              overflowY: getComputedStyle(results).overflowY,
            };
          });
          assert.ok(metrics.pageOverflow <= 2, "Explore itself must not scroll");
          assert.ok(metrics.documentOverflow <= 2, "The document must not scroll");
          assert.ok(metrics.horizontalOverflow <= 2, "There must be no horizontal overflow");
          assert.ok(metrics.resultOverflow > 10, "The named-color list must scroll");
          assert.equal(metrics.overflowY, "auto");
          await results.evaluate(el => { el.scrollTop = el.scrollHeight; });
          assert.ok(await results.evaluate(el => el.scrollTop) > 0);
          const after = await page.locator(".pfx-explore__heading").boundingBox();
          assert.ok(Math.abs(before.y - after.y) <= 2, "Heading must remain fixed while browsing");
          await results.evaluate(el => { el.scrollTop = 0; });
        });

        await check("Search filters by name, canonical keyword and HEX", async () => {
          await search.fill("royal blue");
          assert.equal(await page.locator(".pfx-explore__chip").count(), 1);
          assert.ok(await select("Royal Blue", "#4169e1").isVisible());
          await search.fill("rebeccapurple");
          assert.ok(await select("Rebecca Purple", "#663399").isVisible());
          await search.fill("#ff6347");
          assert.ok(await select("Tomato", "#ff6347").isVisible());
          await search.fill("this-is-not-a-color");
          assert.equal(await page.locator(".pfx-explore__chip").count(), 0);
          assert.match(await page.locator(".pfx-explore__empty").innerText(), /No matching/);
          assert.equal(await hex(), "#010101", "Searching must not change active color");
        });

        await check("Aliases stay discoverable with their canonical RGB value", async () => {
          await search.fill("gray");
          assert.ok(await select("Gray", "#808080").isVisible());
          await search.fill("grey");
          assert.ok(await select("Grey", "#808080").isVisible());
          await search.fill("aqua");
          assert.ok(await select("Aqua", "#00ffff").isVisible());
          await search.fill("cyan");
          assert.ok(await select("Cyan", "#00ffff").isVisible());
        });

        await check("Selecting a color updates only the shared navbar", async () => {
          await search.fill("royal blue");
          await select("Royal Blue", "#4169e1").click();
          await waitHex("#4169e1");
          assert.equal(await select("Royal Blue", "#4169e1").getAttribute("aria-pressed"), "true");
          assert.equal(await page.locator(".pfx-v2__color-chip").evaluate(el =>
            getComputedStyle(el).backgroundColor), "rgb(65, 105, 225)");
          assert.equal(await page.locator(".pfx-c-dock").count(), 0);
        });

        await check("Copying HEX does not change the selected color", async () => {
          await page.getByRole("button", { name: "Copy Royal Blue #4169E1" }).click();
          assert.equal(await page.evaluate(() => window.__PFX_COPIED__), "#4169E1");
          assert.equal(await hex(), "#4169e1");
          assert.match(await page.getByRole("status").last().innerText(), /copied/i);
        });

        await check("The interface works in dark and light themes", async () => {
          await search.fill("");
          for (const theme of ["dark", "light"]) {
            await page.getByRole("button", { name: theme + " theme" }).click();
            assert.equal(await page.locator(".pfx-v2").getAttribute("data-theme"), theme);
            assert.ok(await select("Royal Blue", "#4169e1").isVisible());
            await page.screenshot({
              path: output + "/" + browserName + "-" + viewport.width + "-" + theme + ".png",
              animations: "disabled",
            });
          }
        });

        await check("Color selection persists through navigation and reload", async () => {
          await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Home" }).click();
          await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Explore" }).click();
          assert.equal(await hex(), "#4169e1");
          assert.equal(await page.locator(".pfx-explore__chip").count(), 148);
          await page.reload({ waitUntil: "networkidle" });
          await page.locator('nav[aria-label="Color tools"] button').filter({ hasText: "Explore" }).click();
          assert.equal(await hex(), "#4169e1");
        });

        await check("No browser runtime errors", async () => assert.deepEqual(errors, []));
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
writeFileSync(output + "/report.json", JSON.stringify({
  url: base, total: records.length, passed: records.filter(x => x.result === "PASS").length,
  failed: failures.length, results: records, failures,
}, null, 2));
console.log("Explore named colors:", records.length - failures.length, "/", records.length);
if (failures.length) process.exitCode = 1;
