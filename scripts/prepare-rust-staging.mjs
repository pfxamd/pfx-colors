/**
 * Prepare a standalone static staging artifact from already-tested dist/.
 * Nothing in the production branch or GitHub Pages deployment is changed.
 *
 * Staging works at an independent web origin rooted at / (Cloudflare Pages,
 * static object host, etc). It deliberately has NO deployment side effects.
 */
import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";

const source = resolve("dist");
const output = resolve("staging-dist");
await stat(join(source, "index.html"));
await stat(join(source, "rust", "pfx_color_ffi.wasm"));
await stat(join(source, "rust", "pfx-color-core.mjs"));
await stat(join(source, "rust", "pfx-color-workspace.mjs"));
await cp(source, output, { recursive: true, force: true });

const pagePath = join(output, "index.html");
const original = await readFile(pagePath, "utf8");
assert.match(original, /<head>/);
assert.match(original, /<\/body>/);
assert.doesNotMatch(original, /__PFX_RUST_STAGING__/);

const head = `
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <meta name="color-scheme" content="dark light" />
    <script>window.__PFX_RUST_STAGING__ = true;</script>
`;
const stagingBar = `
    <aside id="pfx-rust-staging-bar" aria-label="Experimental preview"
      style="position:fixed;z-index:2147483600;bottom:12px;right:12px;
        display:flex;align-items:center;gap:10px;padding:9px 12px;
        color:#f5f5f5;background:#202124;border:1px solid #62646a;
        border-radius:9px;font:500 12px system-ui;box-shadow:0 4px 24px #0005">
      <span>Rust preview · staging</span>
      <a href="?engine=rust" style="color:#9cc8ff;text-decoration:underline">Rust</a>
      <a href="?engine=legacy" style="color:#9cc8ff;text-decoration:underline">TypeScript</a>
    </aside>
`;
const page = original.replace("<head>", "<head>" + head)
  .replace("</body>", stagingBar + "</body>");
assert.match(page, /__PFX_RUST_STAGING__ = true/);
assert.match(page, /noindex, nofollow/);
await writeFile(pagePath, page);
await writeFile(join(output, "robots.txt"), "User-agent: *\nDisallow: /\n");
await mkdir(join(output, "preview-info"), { recursive: true });
const manifest = {
  kind: "pfx-colors-rust-staging",
  scope: "isolated-static-preview",
  engineDefault: "rust",
  legacyOverride: "?engine=legacy",
  sourceBranch: "experiment/rust-color-core",
  rustSourceRevision: "28aff99941787ee30f52742c36110bc4e03a8b7c",
  productionModified: false,
  robots: "noindex,nofollow",
  hostingBase: "/",
};
await writeFile(join(output, "preview-info", "build.json"),
  JSON.stringify(manifest, null, 2) + "\n");
for (const file of [
  "index.html", "rust/pfx_color_ffi.wasm",
  "rust/pfx-color-core.mjs", "rust/pfx-color-workspace.mjs", "robots.txt",
]) assert.ok((await stat(join(output, file))).size > 0, file);
console.log("PFx independent Rust staging build ready (no deployment)");
