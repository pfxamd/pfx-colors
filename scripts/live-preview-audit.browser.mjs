import { chromium, firefox } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = process.env.PFX_LIVE_PREVIEW ?? "https://pfxamd.github.io/pfx-colors/preview/";
const evidence = "browser-evidence/live-review";
mkdirSync(evidence, { recursive: true });
const results = [];

for (const [browserName, kind] of [["chromium", chromium], ["firefox", firefox]]) {
  const browser = await kind.launch({ headless: true });
  try {
    for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor:1 });
      const page = await context.newPage();
      const errors = [];
      const failedResponses = [];
      page.on("pageerror", err => errors.push(err.message));
      page.on("response", res => {
        if(res.status() >= 400)failedResponses.push(res.status() + " " + res.url());
      });
      try {
        const response = await page.goto(root, {waitUntil:"networkidle",timeout:60000});
        assert.equal(response?.status(),200);
        await page.locator(".pfx-c-study__swatch").first().waitFor();
        assert.equal(await page.locator(".pfx-c-engine-label").getAttribute("data-engine"),"rust");
        const nav = page.locator('nav[aria-label="Color tools"] button');
        const names = ["Home","Picker","Palette","Harmony","Gradient"];
        for (const name of names) {
          await nav.filter({hasText:name}).click();
          if (name === "Gradient") {
            await page.locator('canvas[data-rust-gradient-preview="ready"]').waitFor({timeout:30000});
          }
          await page.waitForTimeout(160);
          const measurement = await page.evaluate(() => {
            const box = el => {
              const r=el.getBoundingClientRect();
              return {x:r.x,y:r.y,w:r.width,h:r.height};
            };
            const badge = document.querySelector("#pfx-rust-staging-bar");
            const tools = [...document.querySelectorAll("button,input,select,[role='slider'],textarea")];
            const br=badge?.getBoundingClientRect();
            const covered = tools.filter(el => {
              const r=el.getBoundingClientRect();
              if (!br || r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return false;
              const area=Math.max(0,Math.min(br.right,r.right)-Math.max(br.left,r.left))
                *Math.max(0,Math.min(br.bottom,r.bottom)-Math.max(br.top,r.top));
              return area > Math.min(64,r.width*r.height*.15);
            }).map(el=>({tag:el.tagName,aria:el.getAttribute("aria-label")||"",text:(el.textContent||"").trim().slice(0,36),box:box(el)}));
            return {hOverflow:document.documentElement.scrollWidth-innerWidth,
              scrollH:document.documentElement.scrollHeight,
              viewport:{w:innerWidth,h:innerHeight},
              activeTab:document.querySelector("nav[aria-label='Color tools'] button[aria-current],nav[aria-label='Color tools'] button[aria-selected='true']")?.textContent?.trim(),
              stageBadge:badge ? box(badge) : null,
              blockedControls:covered,
              navScroll:document.querySelector("nav[aria-label='Color tools']")?.scrollLeft||0,
              switches:document.querySelectorAll(".pfx-c-workbench").length};
          });
          const nameLower=name.toLowerCase();
          await page.screenshot({path:`${evidence}/${browserName}-${viewport.width}-${nameLower}.png`,fullPage:true,animations:"disabled"});
          results.push({browser:browserName,viewport,name, ...measurement});
          console.log("AUDIT",browserName,viewport.width,name,
            JSON.stringify({overflow:measurement.hOverflow,blocked:measurement.blockedControls.length,scrollH:measurement.scrollH,navScroll:measurement.navScroll}));
        }
        assert.deepEqual(errors,[],browserName+" runtime exceptions");
        assert.deepEqual(failedResponses,[],browserName+" failed assets");
      } finally {
        await context.close();
      }
    }
  } finally { await browser.close(); }
}
writeFileSync(evidence+"/inspection.json",JSON.stringify(results,null,2));
console.log("Live preview five-tools visual capture and DOM audit: DONE");
