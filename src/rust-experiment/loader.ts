/**
 * Experiment only. Loads the independent Rust Color Core built by the pinned
 * GitHub Actions workflow. Never falls back silently to the TypeScript engine.
 *
 * The application still uses its legacy standalone tool functions (Color Study,
 * Palette and gradient UI rendering). This gate replaces the *workspace* logic
 * with the Rust-backed first-party workspace and preserves the existing UI
 * contract for picker commits, gradients, undo and redo.
 */
import type { PfxColorsWorkspace } from "@pfx/color-core";

export type WorkspaceFactory = (initial: string) => PfxColorsWorkspace;

export async function loadExperimentalWorkspace(): Promise<WorkspaceFactory> {
  const assetRoot = new URL("rust/", document.baseURI).pathname;
  const [apiModule, workspaceModule, response] = await Promise.all([
    import(/* @vite-ignore */ assetRoot + "pfx-color-core.mjs"),
    import(/* @vite-ignore */ assetRoot + "pfx-color-workspace.mjs"),
    fetch(assetRoot + "pfx_color_ffi.wasm"),
  ]);
  if (!response.ok) {
    throw new Error("Rust WASM unavailable (" + response.status + ")");
  }
  const core = await apiModule.createPfxColorCore(await response.arrayBuffer());
  if (typeof workspaceModule.createPfxColorsWorkspace !== "function") {
    throw new Error("Rust workspace API is missing");
  }
  // This structural adapter is deliberately isolated and verified against
  // real browser interactions in rust-integration.browser.mjs. The upstream
  // workspace is not advertised as a generally compatible drop-in package.
  return (initial: string) =>
    workspaceModule.createPfxColorsWorkspace(core, initial) as PfxColorsWorkspace;
}
