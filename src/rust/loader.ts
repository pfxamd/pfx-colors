/**
 * Load the pinned first-party Rust WebAssembly color core and workspace.
 * Keep this loader asynchronous: the explicit legacy mode never fetches WASM.
 * Startup failures are handled by the app entry point, which falls back to
 * the existing TypeScript engine rather than presenting a blank interface.
 */
import type { PfxColorsWorkspace } from "@pfx/color-core";
import { enableRustOperations } from "./operations";

export type WorkspaceFactory = (initial: string) => PfxColorsWorkspace;

export async function loadRustWorkspace(): Promise<WorkspaceFactory> {
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
  enableRustOperations(core);
  // The app-facing workspace adapter is covered by Rust/legacy parity tests.
  return (initial: string) =>
    workspaceModule.createPfxColorsWorkspace(core, initial) as PfxColorsWorkspace;
}
