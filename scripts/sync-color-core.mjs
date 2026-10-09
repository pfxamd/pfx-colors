import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = "https://github.com/pfxamd/pfx-color-core.git";
const revision = "d07951fd1a9cf80c39ee17de8d9313cdda4e1cbe";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "vendor", "PFx-Color-Core");
const marker = join(target, "PINNED_REVISION");

if (existsSync(marker) && readFileSync(marker, "utf8").trim() === revision) {
  process.exit(0);
}

const temporary = mkdtempSync(join(tmpdir(), "pfx-color-core-"));
try {
  execFileSync("git", ["init", temporary], { stdio: "ignore" });
  execFileSync("git", ["-C", temporary, "remote", "add", "origin", repository], { stdio: "ignore" });
  execFileSync("git", ["-C", temporary, "fetch", "--depth", "1", "origin", revision], { stdio: "inherit" });
  execFileSync("git", ["-C", temporary, "checkout", "--detach", "FETCH_HEAD"], { stdio: "ignore" });
  const actual = execFileSync("git", ["-C", temporary, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (actual !== revision) throw new Error("Color core revision mismatch: expected " + revision + ", got " + actual);
  const staging = join(root, "vendor", "PFx-Color-Core.new");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  cpSync(join(temporary, "src"), join(staging, "src"), { recursive: true });
  cpSync(join(temporary, "LICENSE"), join(staging, "LICENSE"));
  writeFileSync(join(staging, "PINNED_REVISION"), revision + "\n");
  rmSync(target, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(staging, target, { recursive: true });
  rmSync(staging, { recursive: true, force: true });
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
