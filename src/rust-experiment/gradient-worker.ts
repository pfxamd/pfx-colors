/** Branch-only Rust pixel rendering on a dedicated worker. No DOM or CSS color math. */
import type { GradientDefinition } from "@pfx/color-core";

type CoreColor = { space: string; channels: number[]; alpha: number };
type PixelHandle = { rasterRGBA8(width: number, height: number): Uint8ClampedArray; dispose(): void };
type WasmCore = {
  createCssGradient(stops: Array<{ position: number; color: CoreColor }>,
    options: Record<string, unknown>): PixelHandle;
};
type Job = { kind: "render"; revision: number; gradient: GradientDefinition; width: number; height: number };
type Init = { kind: "init"; assetRoot: string };
type Incoming = Init | Job;

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<Incoming>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
let corePromise: Promise<WasmCore> | null = null;
let latest: Job | null = null;
let busy = false;
const colorSpace = (value: string) => value === "p3" ? "display-p3" : value;

function initialize(assetRoot: string): Promise<WasmCore> {
  return Promise.all([
    import(/* @vite-ignore */ assetRoot + "pfx-color-core.mjs"),
    fetch(assetRoot + "pfx_color_ffi.wasm"),
  ]).then(async ([module, response]) => {
    if (!response.ok) throw new Error("Rust gradient worker WASM unavailable: " + response.status);
    return module.createPfxColorCore(await response.arrayBuffer()) as WasmCore;
  });
}

function render(core: WasmCore, job: Job): Uint8ClampedArray {
  const { gradient, width, height } = job;
  if (!Number.isInteger(width) || !Number.isInteger(height)
    || width < 1 || height < 1 || width * height > 32768) {
    throw new RangeError("Invalid Rust gradient worker dimensions");
  }
  const stops = gradient.stops.map(stop => ({
    position: stop.position,
    color: {
      space: colorSpace(stop.source.space),
      channels: stop.source.coordinates.map(value => value ?? 0),
      alpha: stop.source.alpha,
    },
  }));
  const handle = core.createCssGradient(stops, {
    kind: gradient.type,
    width, height,
    angle: gradient.angle,
    centerX: gradient.centerX * width,
    centerY: gradient.centerY * height,
    radialShape: "circle",
    radialExtent: "farthest-corner",
    space: colorSpace(gradient.interpolationSpace),
    target: colorSpace(gradient.targetSpace),
    hue: gradient.hue ?? "shorter",
    gamut: "css",
  });
  try {
    const pixels = handle.rasterRGBA8(width, height);
    if (pixels.length !== width * height * 4) {
      throw new Error("Rust raster returned an invalid pixel count");
    }
    return pixels;
  } finally {
    handle.dispose();
  }
}

async function drain(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    if (!corePromise) throw new Error("Rust worker not initialized");
    const core = await corePromise;
    while (latest) {
      const job = latest;
      latest = null;
      const start = performance.now();
      const pixels = render(core, job);
      scope.postMessage({
        kind: "frame", revision: job.revision,
        width: job.width, height: job.height,
        durationMs: performance.now() - start,
        pixels: pixels.buffer,
      }, [pixels.buffer]);
    }
  } catch (error) {
    scope.postMessage({
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    busy = false;
    if (latest) void drain();
  }
}

scope.onmessage = (event: MessageEvent<Incoming>) => {
  if (event.data.kind === "init") {
    if (!corePromise) corePromise = initialize(event.data.assetRoot);
  } else {
    latest = event.data;
    void drain();
  }
};
