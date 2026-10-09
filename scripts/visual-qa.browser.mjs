/** Screenshot-driven responsive / light-dark regression before shipping. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, firefox } from "playwright";

const base = process.env.PFX_COLORS_URL ?? "http://127.0.0.1:4173/pfx-colors/";
const root = "browser-evidence/visual-qa";
mkdirSync(root, { recursive: true });
const toolNames = ["Home", "Explore", "Picker", "Tones", "Harmony", "Gradient", "Collections"];
const results = [];
function luminance(css) {
  const channels = /^#[a-f\d]{6}$/i.test(css) ? [1,3,5].map(i => parseInt(css.slice(i,i+2),16)) : (css.match(/[\d.]+/g) ?? []).slice(0,3).map(Number);
  return channels.map(value => {
    const n = value / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a,b) {
  const x=luminance(a),y=luminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
for (const [browserName, launcher] of [["chromium",chromium],["firefox",firefox]]) {
  const browser = await launcher.launch({ headless:true });
  try {
    for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
      const context = await browser.newContext({viewport,deviceScaleFactor:1});
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror",e => errors.push(e.message));
      try {
        await page.goto(base,{waitUntil:"networkidle",timeout:60000});
        await page.locator(".pfx-c-engine-label[data-engine='rust']").waitFor({state:"attached"});
        for (const theme of ["dark","light"]) {
          await page.getByRole("button",{name:theme+" theme"}).click();
          assert.equal(await page.locator(".pfx-v2").getAttribute("data-theme"),theme);
          for (const tool of toolNames) {
            await page.locator('nav[aria-label="Color tools"] button').filter({hasText:tool}).click();
            const region = page.locator(".pfx-v2__page");
            await region.waitFor();
            await region.evaluate(el => {el.scrollTop=0;});
            await page.evaluate(() => new Promise(resolve =>
              requestAnimationFrame(() => requestAnimationFrame(resolve))));
            if (tool === "Gradient") {
              await page.locator('canvas[data-rust-gradient-preview="ready"]').waitFor({timeout:30000});
            }
            const v = await page.evaluate(() => {
              const shell=document.querySelector(".pfx-v2");
              const region=document.querySelector(".pfx-v2__page");
              const heading=region?.querySelector("h1");
              const tab=document.querySelector('nav[aria-label="Color tools"] button[aria-current="page"]');
              const nav=document.querySelector('nav[aria-label="Color tools"]');
              const tabRect=tab?.getBoundingClientRect(),navRect=nav?.getBoundingClientRect();
              const style=getComputedStyle(shell);
              const tokens={};
              for (const k of ["muted","bg","panel","accent","accent-soft"]) {
                tokens[k]=style.getPropertyValue("--pfx-"+k).trim();
              }
              const feedback=document.querySelector(".pfx-v2__copy-feedback");
              return {
                overflow:document.documentElement.scrollWidth-window.innerWidth,
                pageWidth:region?.scrollWidth,
                pageClientWidth:region?.clientWidth,
                pageScrollHeight:region?.scrollHeight,
                pageHeight:region?.clientHeight,
                title:heading?.textContent?.trim() ?? "",
                titleVisible:Boolean(heading?.getBoundingClientRect().height),
                titleColor:heading ? getComputedStyle(heading).color : "",
                pageBackground:region ? getComputedStyle(region).backgroundColor : "",
                activeTabVisible:Boolean(tabRect&&navRect &&
                  tabRect.left >= navRect.left-2 && tabRect.right <= navRect.right+2),
                tokens, feedbackWidth:feedback?.getBoundingClientRect().width ?? 0,
              };
            });
            assert.ok(v.titleVisible,browserName+" "+tool+" missing heading");
            assert.ok(contrast(v.titleColor,v.pageBackground)>=4.5,
              browserName+" "+tool+" unreadable title in "+theme+": "+contrast(v.titleColor,v.pageBackground).toFixed(2));
            assert.ok(v.activeTabVisible,browserName+" "+tool+" tab clipped");
            assert.ok(v.overflow<=2,browserName+" "+tool+" document overflow: "+v.overflow);
            assert.ok((v.pageWidth??0)-(v.pageClientWidth??0)<=3,
              browserName+" "+tool+" page overflow");
            for (const [name,a,b] of [
              ["muted on page",v.tokens.muted,v.tokens.bg],
              ["muted on panel",v.tokens.muted,v.tokens.panel],
              ["accent on page",v.tokens.accent,v.tokens.bg],
              ["accent on soft",v.tokens.accent,v.tokens["accent-soft"]],
            ]) assert.ok(contrast(a,b)>=4.5,theme+" "+name+" "+contrast(a,b).toFixed(2));
            assert.ok(v.feedbackWidth<1,"Copy feedback should not render a square");
            const name=browserName+"-"+viewport.width+"-"+theme+"-"+tool.toLowerCase();
            await page.screenshot({path:root+"/"+name+"-top.png",animations:"disabled"});
            if (v.pageScrollHeight>v.pageHeight+70) {
              await region.evaluate(el => {el.scrollTop=el.scrollHeight;});
              await page.screenshot({path:root+"/"+name+"-bottom.png",animations:"disabled"});
            }
            results.push({browserName,viewport,theme,tool,...v});
          }
        }
        assert.deepEqual(errors,[],browserName+" "+viewport.width+" runtime errors");
      } finally {await context.close();}
    }
  } finally {await browser.close();}
}
writeFileSync(root+"/report.json",JSON.stringify(results,null,2));
console.log("VISUAL QA PASS",results.length,"tool/theme/viewport/browser combinations");
