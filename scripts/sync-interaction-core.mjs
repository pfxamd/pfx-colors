import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = "https://github.com/pfxamd/PFx-Interaction-Core.git";
const revision = "ca3d77bb7e0f702d88a3bb695d97ac7f55ae77ad";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "vendor", "PFx-Interaction-Core");

function git(args, cwd = root) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

function currentRevision() {
  if (!existsSync(resolve(target, ".git"))) return null;
  try {
    return git(["rev-parse", "HEAD"], target);
  } catch {
    return null;
  }
}

if (currentRevision() !== revision) {
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });

  git(["clone", "--filter=blob:none", "--no-checkout", repository, target]);
  git(["fetch", "--depth", "1", "origin", revision], target);
  git(["checkout", "--detach", "FETCH_HEAD"], target);

  const checkedOut = currentRevision();
  if (checkedOut !== revision) {
    throw new Error(
      `PFx Interaction Core revision mismatch: expected ${revision}, received ${checkedOut ?? "none"}`,
    );
  }
}
