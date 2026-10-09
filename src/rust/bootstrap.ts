import { colorEngine } from "@pfx/color-core";
import { PilotRustColorEngine, pilotMetrics, type RustColorApi } from "./opt-in-engine";

/**
 * Only ?engine=rust enables this experiment. Default navigation is unchanged.
 * No network request to GitHub or any third party is needed in the browser.
 * The wrapper + wasm are copied into this project's output at build time.
 */
export async function initializeRustPilot(): Promise<void> {
  if (!new URLSearchParams(window.location.search).has("engine") ||
      new URLSearchParams(window.location.search).get("engine") !== "rust") {
    return;
  }
  (globalThis as typeof globalThis & { __pfxRustPilot?: typeof pilotMetrics })
    .__pfxRustPilot = pilotMetrics;
  pilotMetrics.status = "loading";
  try {
    const root = new URL("./", window.location.href);
    const wrapperUrl = new URL("pfx-rust/pfx-color-core.mjs", root).href;
    const wasmUrl = new URL("pfx-rust/pfx_color_ffi.wasm", root).href;
    const wrapper = await import(/* @vite-ignore */ wrapperUrl) as {
      createPfxColorCore: (bytes: ArrayBuffer) => Promise<RustColorApi>;
    };
    const response = await fetch(wasmUrl);
    if (!response.ok) throw new Error("Rust WASM asset unavailable (HTTP " + response.status + ")");
    const rust = await wrapper.createPfxColorCore(await response.arrayBuffer());
    const legacy = colorEngine.color;
    Object.assign(colorEngine, {
      color: new PilotRustColorEngine(legacy, rust, pilotMetrics),
    });
    pilotMetrics.status = "rust";
  } catch (error) {
    pilotMetrics.reason = error instanceof Error ? error.message : String(error);
    pilotMetrics.status = "fallback";
  }
}
