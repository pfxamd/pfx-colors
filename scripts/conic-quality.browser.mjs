import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
import Color from "colorjs.io";
import sharp from "sharp";
import { chromium } from "playwright";

const url = process.env.PFX_COLORS_URL ?? "http://127.0.0.1:4173/";
const out = "browser-evidence/conic-quality";
mkdirSync(out, { recursive: true });

async function importPureTs(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}
const { smoothConicStops } = await importPureTs("../src/app/conic-path.ts");
const toOklch = color => {
  const item = typeof color === "string"
    ? new Color(color)
    : new Color(color.space, color.coordinates, color.alpha ?? 1);
  const converted = item.to("oklch");
  return { coordinates: converted.coords, alpha: converted.alpha };
};
const toWire = stop => {
  const item = typeof stop.color === "string" ? new Color(stop.color) :
    new Color(stop.color.space, stop.color.coordinates, stop.color.alpha ?? 1);
  const coordinates = item.coords;
  return {
    position: stop.position,
    color: { space: item.spaceId, channels: [...coordinates], alpha: item.alpha },
  };
};
const specs = [
  { label: "two-opposites", stops: [
    { position: 0, color: "#FF0014" },
    { position: 0.5, color: "#00ABC7" },
  ] },
  { label: "three-vivid", stops: [
    { position: 0, color: "#FF4F00" },
    { position: 0.3, color: "#DB05E9" },
    { position: 0.68, color: "#0977F7" },
  ] },
  { label: "six-hues", stops: [
    { position: 0, color: "#F02057" },
    { position: 0.12, color: "#EB8F24" },
    { position: 0.29, color: "#C9DE0B" },
    { position: 0.46, color: "#00B69A" },
    { position: 0.63, color: "#1578FF" },
    { position: 0.82, color: "#9C41F7" },
  ] },
  { label: "transparent", stops: [
    { position: 0, color: { space: "srgb", coordinates: [1, 0, 0.13], alpha: 0.25 } },
    { position: 0.28, color: { space: "srgb", coordinates: [0.05, 0.9, 0.9], alpha: 0.8 } },
    { position: 0.72, color: { space: "srgb", coordinates: [0.75, 0.2, 1], alpha: 0.4 } },
  ] },
  { label: "low-chroma", stops: [
    { position: 0, color: "#F5F0EA" },
    { position: 0.33, color: "#777B81" },
    { position: 0.7, color: "#181D27" },
  ] },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
try {
  const response = await page.goto(new URL(url).href, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200);
  const results = [];
  for (const spec of specs) {
    const painted = smoothConicStops(spec.stops, toOklch);
    const closed = [...spec.stops, { position: 1, color: spec.stops[0].color }];
    assert.ok(painted.length >= spec.stops.length + 1);
    assert.ok(painted.length <= 129);
    assert.equal(painted.at(-1).position, 1);
    const pairs = [closed.map(toWire), painted.map(toWire)];
    const rendered = await page.evaluate(async ({ pairs, positions }) => {
      const root = new URL("rust/", document.baseURI);
      const module = await import(new URL("pfx-color-core.mjs", root).href);
      const wasm = await fetch(new URL("pfx_color_ffi.wasm", root));
      if (!wasm.ok) throw new Error("WASM not available for conic quality QA");
      const api = await module.createPfxColorCore(await wasm.arrayBuffer());
      const images = [];
      for (const stops of pairs) {
        const gradient = api.createCssGradient(stops, {
          kind: "conic", width: 320, height: 320, centerX: 160, centerY: 160,
          angle: 0, space: "oklch", target: "srgb", hue: "shorter", gamut: "css",
        });
        try {
          const start = performance.now();
          const exact = gradient.rasterRGBA8(320, 320);
          const exactMs = performance.now() - start;
          const fastStart = performance.now();
          const fast = gradient.rasterPreviewRGBA8(320, 320);
          const fastMs = performance.now() - fastStart;
          let largest = 0;
          let total = 0;
          let outside3 = 0;
          for (let i = 0; i < exact.length; i++) {
            const difference = Math.abs(exact[i] - fast[i]);
            largest = Math.max(largest, difference);
            total += difference;
            if (difference > 3) outside3++;
          }
          const at = [];
          for (const p of positions) {
            const eps = 0.0001;
            const left = gradient.sampleProgress(p === 0 ? 1 - eps : p - eps);
            const middle = gradient.sampleProgress(p);
            const right = gradient.sampleProgress(p + eps);
            at.push({ p, left, middle, right });
          }
          images.push({
            pixels: Array.from(exact), approximate: Array.from(fast),
            exactMs, fastMs, largest, meanAbs: total / exact.length,
            outside3: outside3 / exact.length, samples: at,
          });
        } finally {
          gradient.dispose();
        }
      }
      return images;
    }, { pairs, positions: spec.stops.map(s => s.position) });

    const toVector = source => {
      const color = new Color(source.space, source.channels, source.alpha).to("oklab");
      return color.coords;
    };
    const jump = ({ left, middle, right }) => {
      const [a, b, c] = [left, middle, right].map(toVector);
      return Math.hypot(...a.map((v, i) => c[i] - 2 * b[i] + v)) / 0.0001;
    };
    const before = rendered[0].samples.map(jump);
    const after = rendered[1].samples.map(jump);
    const average = items => items.reduce((a, b) => a + b, 0) / items.length;
    const improvement = average(before) / Math.max(average(after), 1e-8);

    for (let i = 0; i < rendered.length; i++) {
      const item = rendered[i];
      const key = i === 0 ? "linear" : "periodic";
      const png = await sharp(Buffer.from(item.pixels), {
        raw: { width: 320, height: 320, channels: 4 },
      }).png().toBuffer();
      writeFileSync(out + "/" + spec.label + "-" + key + ".png", png);
      delete item.pixels;
      delete item.approximate;
      delete item.samples;
    }
    // Both variants use the same Rust output gamut and 320×320 pixel geometry.
    results.push({
      label: spec.label,
      originalStops: spec.stops.length,
      paintedStops: painted.length,
      meanTangentDiscontinuityOld: average(before),
      meanTangentDiscontinuityNew: average(after),
      tangentSmoothnessRatio: improvement,
      baseline: rendered[0],
      periodic: rendered[1],
    });
  }
  writeFileSync(out + "/metrics.json", JSON.stringify(results, null, 2));
  console.log("CONIC QUALITY METRICS", JSON.stringify(results));
  console.log("CONIC QUALITY COMPARISON PASS", specs.length, "palettes");
} finally {
  await page.close();
  await browser.close();
}
