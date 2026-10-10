import assert from "node:assert/strict";
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { chromium, firefox } from "playwright";

const base = process.env.PFX_COLORS_URL ?? "http://127.0.0.1:4173/pfx-colors/";
mkdirSync("browser-evidence/color-tools", { recursive: true });
const width = 96, height = 48;
const bytes = Buffer.alloc(width * height * 3);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const color = x < 32 ? [227, 38, 66] : x < 64 ? [37, 184, 92] : [55, 82, 225];
    bytes.set(color, (y * width + x) * 3);
  }
}
const fixture = await sharp(bytes, {raw:{width,height,channels:3}}).png().toBuffer();
for (const [browserName, launcher] of [["chromium",chromium],["firefox",firefox]]) {
  const browser = await launcher.launch({headless:true});
  try {
    for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
      const page = await browser.newPage({viewport});
      const errors = [];
      page.on("pageerror", error=>errors.push(error.message));
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable:true, value:{writeText: async text=>{window.__COPIED__ = text;}},
        });
      });
      try {
        const response = await page.goto(base,{waitUntil:"networkidle"});
        assert.equal(response?.status(),200);
        await page.locator('nav[aria-label="Color tools"] button').filter({hasText:"Image"}).click();
        await page.locator(".pfx-image").waitFor();
        assert.equal(await page.getByRole("button",{name:"Save palette"}).count(),0);
        await page.getByLabel("Choose image").setInputFiles({
          name:"fixture.png",mimeType:"image/png",buffer:fixture,
        });
        await page.waitForFunction(() =>
          document.querySelectorAll(".pfx-image__swatches article").length >= 2);
        const swatches = await page.locator(".pfx-image__swatches article").count();
        assert.ok(swatches>=2 && swatches<=6,"Image generates an editable palette");
        await page.getByRole("button",{name:"Copy all HEX"}).click();
        assert.match(await page.evaluate(() => window.__COPIED__ ?? ""), /^#[0-9A-F]{6}/);
        await page.getByRole("button",{name:"Save palette"}).click();
        await page.getByRole("button",{name:"Send to Gradient"}).click();
        await page.locator(".pfx-c-workbench--gradient").waitFor();
        assert.ok(await page.locator(".pfx-c-gradient-stop-handle").count()>=2,
          "Image colors are transferred to editable gradients");
        await page.locator('nav[aria-label="Color tools"] button').filter({hasText:"Contrast"}).click();
        await page.locator(".pfx-contrast").waitFor();
        const input = page.getByRole("textbox",{name:"Text color HEX"});
        await input.fill("#ffffff"); await input.press("Enter");
        assert.equal((await page.locator(".pfx-contrast__ratio strong").innerText()).trim(),"1.00:1");
        assert.equal(await page.locator(".pfx-contrast__criteria .pfx-contrast__fail").count(),4);
        await page.getByRole("button",{name:"Find readable text"}).click();
        assert.equal((await page.locator(".pfx-contrast__ratio strong").innerText()).trim(),"21.00:1");
        assert.equal(await page.locator(".pfx-contrast__criteria .pfx-contrast__pass").count(),4);
        await page.getByRole("button",{name:"Copy CSS"}).click();
        assert.match(await page.evaluate(() => window.__COPIED__ ?? ""),/background-color: #FFFFFF/);
        await page.locator('nav[aria-label="Color tools"] button').filter({hasText:"Collections"}).click();
        await page.getByRole("button",{name:/Saved sets/}).click();
        assert.equal(await page.locator(".pfx-c-collections__set").count(),1,
          "Image palette is available as a saved color set");
        await page.screenshot({path:"browser-evidence/color-tools/"+browserName+"-"+viewport.width+".png",
          animations:"disabled"});
        assert.deepEqual(errors,[],"No runtime errors");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
          "No horizontal document overflow");
        console.log("COLOR TOOLS PASS",browserName,viewport.width);
      } finally {await page.close();}
    }
  } finally {await browser.close();}
}
