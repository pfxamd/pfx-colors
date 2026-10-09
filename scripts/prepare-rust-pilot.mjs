/**
 * Pin and compile the external-free Rust engine once for this app build.
 * Runtime uses LOCAL, copied .wasm + .mjs only; no remote dependency.
 * This is an experimental branch tool, never invoked from main deploy.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const revision = "7b382b115de33a43845a5dea9409a57e68d2210f";
const source = "https://github.com/pfxamd/pfx-color-core.git";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "public", "pfx-rust");
const temporary = mkdtempSync(join(tmpdir(), "pfx-rust-pilot-"));

try {
  execFileSync("git", ["init", temporary], { stdio: "ignore" });
  execFileSync("git", ["-C", temporary, "remote", "add", "origin", source]);
  execFileSync("git", ["-C", temporary, "fetch", "--depth", "1", "origin", revision], { stdio: "inherit" });
  execFileSync("git", ["-C", temporary, "checkout", "--detach", "FETCH_HEAD"], { stdio: "ignore" });
  const head = execFileSync("git", ["-C", temporary, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (head !== revision) throw new Error("Pinned Rust revision mismatch");
  execFileSync("cargo", ["build", "-p", "pfx-color-ffi", "--target", "wasm32-unknown-unknown", "--release"], {
    cwd: temporary, stdio: "inherit",
  });
  const wasm = join(temporary, "target/wasm32-unknown-unknown/release/pfx_color_ffi.wasm");
  const wrapper = join(temporary, "bindings/javascript/pfx-color-core.mjs");
  if (!existsSync(wasm) || !existsSync(wrapper)) throw new Error("Missing compiled Rust WASM assets");
  mkdirSync(output, { recursive: true });
  cpSync(wasm, join(output, "pfx_color_ffi.wasm"));
  cpSync(wrapper, join(output, "pfx-color-core.mjs"));
  cpSync(join(temporary, "bindings/javascript/pfx-color-tools.mjs"), join(output, "pfx-color-tools.mjs"));
  cpSync(join(temporary, "bindings/javascript/pfx-color-workspace.mjs"), join(output, "pfx-color-workspace.mjs"));
  writeFileSync(join(output, "REVISION"), revision + "\n");
  console.log("Pinned Rust engine compiled and bundled locally:", revision);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
