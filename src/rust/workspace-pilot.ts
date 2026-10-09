import { PfxColorsWorkspace } from "@pfx/color-core";
import { pilotMetrics, type RustColorApi } from "./opt-in-engine";

/** The public workspace methods used by the React UI. */
export type PilotWorkspace = Pick<PfxColorsWorkspace,
  "getState" | "canUndo" | "canRedo" | "setColor" |
  "generateTonalPalette" | "generateRampPalette" | "generateHarmony" |
  "generatePaletteFromHarmony" | "createGradient" |
  "createGradientFromPalette" | "createGradientFromHarmony" |
  "setColorFromPalette" | "setColorFromHarmony" | "setColorFromGradient" |
  "undo" | "redo" | "clearHistory"
>;
type FirstPartyFactory = (core: RustColorApi, color: string) => PilotWorkspace;

let rustCore: RustColorApi | null = null;
let rustFactory: FirstPartyFactory | null = null;

/** Called only after successful loading of the locally bundled WASM engine. */
export function configureRustWorkspace(core: RustColorApi, factory: FirstPartyFactory): void {
  rustCore = core;
  rustFactory = factory;
}

/**
 * The Rust-powered workspace is a SECOND opt-in inside the experiment:
 * ?engine=rust&workspace=rust
 *
 * The default, and regular ?engine=rust mode, retain the current history
 * implementation. A structural check of the initial immutable state
 * protects app startup; this is not yet a full feature-parity guarantee.
 */
export function createPilotWorkspace(initial: string): PilotWorkspace {
  const legacy = new PfxColorsWorkspace(initial);
  if (typeof window === "undefined" ||
    new URLSearchParams(window.location.search).get("workspace") !== "rust") {
    return legacy;
  }
  if (!rustCore || !rustFactory) {
    pilotMetrics.fallbackCalls++;
    return legacy;
  }
  try {
    const candidate = rustFactory(rustCore, initial);
    const original = legacy.getState();
    const proposed = candidate.getState();
    if (proposed.color.hex !== original.color.hex ||
      proposed.color.gamut.srgb !== original.color.gamut.srgb ||
      proposed.color.gamut.p3 !== original.color.gamut.p3 ||
      !Array.isArray(proposed.color.values?.hsl?.coordinates) ||
      !Array.isArray(proposed.color.values?.oklch?.coordinates) ||
      candidate.canUndo() || candidate.canRedo()) {
      throw new Error("Initial Rust workspace state is incompatible");
    }
    pilotMetrics.rustCalls++;
    pilotMetrics.routes.workspace = (pilotMetrics.routes.workspace ?? 0) + 1;
    // Test-only readonly status probe; no mutation of workspace from tests.
    (window as typeof window & {
      __pfxRustWorkspaceDebug?: () => { color: string; canUndo: boolean; canRedo: boolean };
    }).__pfxRustWorkspaceDebug = () => ({
      color: candidate.getState().color.hex,
      canUndo: candidate.canUndo(),
      canRedo: candidate.canRedo(),
    });
    return candidate;
  } catch (error) {
    pilotMetrics.fallbackCalls++;
    pilotMetrics.reason = error instanceof Error ? error.message : String(error);
    return legacy;
  }
}
