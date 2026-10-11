import {
  useEffect, useMemo, useRef, useState, type CSSProperties,
  type PointerEvent as ReactPointerEvent, type RefObject,
} from "react";
import type { ColorInput, ColorValue, GradientStopInput, GradientType, WorkspaceState, PfxColorsWorkspace } from "@pfx/color-core";
import { useNormalizedDragSurface } from "../interaction/use-normalized-drag-surface";
import { useHorizontalTrackDrag } from "../interaction/use-horizontal-track-drag";
import { angleFromNormalizedPoint, useAngleHandleDrag, useNormalizedHandleDrag } from "../interaction/use-gradient-geometry";
import { colorEngine, createGradient, generateHarmony, gradientToCss, sampleGradient, isRustEngine, recordRustGradientRaster } from "../rust/operations";
import { copyColorText } from "./clipboard";
import { useStoredState, numberBetween, oneOf } from "./workspace-state";
import type { SavedGradientDraft } from "./gradient-session";
import { gradientExport, gradientCssExport, compactGradientCss } from "./gradient-export";
import { generateRandomGradient } from "./gradient-random";
import { closeConicGradient, conicEditableLimit, prepareConicStops } from "./conic-loop";

function validCenter(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== "object") return false;
  const center = value as { x?: unknown; y?: unknown };
  return numberBetween(0, 1)(center.x) && numberBetween(0, 1)(center.y);
}
function asInput(value: ColorValue): ColorInput {
  return { space: value.space, coordinates: value.coordinates.map(value => value ?? 0), alpha: value.alpha };
}
function downloadText(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function GradientStopHandle({
  railRef,
  index,
  position,
  hex,
  min,
  max,
  selected,
  onChange,
  onSelect,
}: {
  railRef: RefObject<HTMLDivElement | null>;
  index: number;
  position: number;
  hex: string;
  min: number;
  max: number;
  selected: boolean;
  onChange: (value: number) => void;
  onSelect: () => void;
}) {
  const handleRef = useRef<HTMLButtonElement>(null);

  useHorizontalTrackDrag(handleRef, railRef, {
    value: position,
    min,
    max,
    step: 0.005,
    onChange,
  });

  return (
    <button
      ref={handleRef}
      type="button"
      className={
        "pfx-c-gradient-stop-handle" + (selected ? " pfx-is-selected" : "")
      }
      style={{
        left: String(position * 100) + "%",
        "--pfx-stop-color": hex,
      } as CSSProperties}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      role="slider"
      aria-label={"Gradient stop " + String(index + 1)}
      aria-valuemin={Math.round(min * 100)}
      aria-valuemax={Math.round(max * 100)}
      aria-valuenow={Math.round(position * 100)}
      title={hex.toUpperCase() + " · " + String(Math.round(position * 100)) + "%"}
    >
      <span />
    </button>
  );
}

function GradientTypeGlyph({ type }: { type: GradientType }) {
  return (
    <span
      className={"pfx-c-gradient-type-glyph pfx-is-" + type}
      aria-hidden="true"
    />
  );
}

function GradientHexInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: ColorInput) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const apply = () => {
    try {
      onChange(draft);
    } catch {
      setDraft(value);
    }
  };

  return (
    <input
      className="pfx-c-gradient-color-editor__hex"
      value={draft.toUpperCase()}
      spellCheck={false}
      aria-label="Selected stop hex color"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={apply}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          apply();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function GradientColorEditor({
  color,
  onChange,
}: {
  color: ColorValue;
  onChange: (value: ColorInput) => void;
}) {
  const hsl = colorEngine.color.convert(asInput(color), "hsl");
  const hue = Number(hsl.coordinates[0] ?? 0);
  const saturation = Number(hsl.coordinates[1] ?? 0);
  const lightness = Number(hsl.coordinates[2] ?? 0);
  const alpha = Number(hsl.alpha ?? 1);

  const fieldRef = useRef<HTMLDivElement>(null);
  const hueTrackRef = useRef<HTMLDivElement>(null);
  const hueHandleRef = useRef<HTMLButtonElement>(null);
  const alphaTrackRef = useRef<HTMLDivElement>(null);
  const alphaHandleRef = useRef<HTMLButtonElement>(null);

  const commitHsl = (
    nextHue = hue,
    nextSaturation = saturation,
    nextLightness = lightness,
    nextAlpha = alpha,
  ) => {
    onChange({
      space: "hsl",
      coordinates: [nextHue, nextSaturation, nextLightness],
      alpha: nextAlpha,
    });
  };

  useNormalizedDragSurface(fieldRef, ({ x, y }) => {
    commitHsl(hue, x * 100, (1 - y) * 100, alpha);
  });

  useHorizontalTrackDrag(hueHandleRef, hueTrackRef, {
    value: hue / 360,
    min: 0,
    max: 1,
    step: 1 / 360,
    onChange(value) {
      commitHsl(value * 360, saturation, lightness, alpha);
    },
  });

  useHorizontalTrackDrag(alphaHandleRef, alphaTrackRef, {
    value: alpha,
    min: 0,
    max: 1,
    step: 0.01,
    onChange(value) {
      commitHsl(hue, saturation, lightness, value);
    },
  });

  return (
    <div className="pfx-c-gradient-color-editor">
      <div
        ref={fieldRef}
        className="pfx-c-gradient-color-editor__field"
        style={{ "--pfx-hue": String(hue) } as CSSProperties}
      >
        <i
          style={{
            left: "clamp(8px, " + String(saturation) + "%, calc(100% - 8px))",
            top: "clamp(8px, " + String(100 - lightness) + "%, calc(100% - 8px))",
            background: color.hex ?? color.css,
          }}
        />
      </div>

      <div ref={hueTrackRef} className="pfx-c-gradient-color-editor__hue">
        <button
          ref={hueHandleRef}
          type="button"
          style={{ left: String((hue / 360) * 100) + "%" }}
          aria-label="Hue"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hue)}
        />
      </div>

      <div className="pfx-c-gradient-color-editor__meta">
        <GradientHexInput
          value={color.hex ?? colorEngine.color.formatHex(asInput(color))}
          onChange={onChange}
        />
        <output>{String(Math.round(alpha * 100)).padStart(3, "0")}%</output>
      </div>

      <div
        ref={alphaTrackRef}
        className="pfx-c-gradient-color-editor__alpha"
        style={
          {
            "--pfx-alpha-color": color.hex ?? color.css,
          } as CSSProperties
        }
      >
        <button
          ref={alphaHandleRef}
          type="button"
          style={{ left: String(alpha * 100) + "%" }}
          aria-label="Opacity"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(alpha * 100)}
        />
      </div>
    </div>
  );
}

function GradientCanvasGeometry({
  surfaceRef,
  type,
  angle,
  center,
  onAngleChange,
  onCenterChange,
}: {
  surfaceRef: RefObject<HTMLDivElement | null>;
  type: GradientType;
  angle: number;
  center: { x: number; y: number };
  onAngleChange: (angle: number) => void;
  onCenterChange: (center: { x: number; y: number }) => void;
}) {
  const linearStartRef = useRef<HTMLButtonElement>(null);
  const linearEndRef = useRef<HTMLButtonElement>(null);
  const centerRef = useRef<HTMLButtonElement>(null);
  const conicAngleRef = useRef<HTMLButtonElement>(null);

  useAngleHandleDrag(
    linearStartRef,
    surfaceRef,
    { x: 0.5, y: 0.5 },
    onAngleChange,
    true,
  );
  useAngleHandleDrag(
    linearEndRef,
    surfaceRef,
    { x: 0.5, y: 0.5 },
    onAngleChange,
  );
  useNormalizedHandleDrag(centerRef, surfaceRef, onCenterChange);
  useAngleHandleDrag(
    conicAngleRef,
    surfaceRef,
    center,
    onAngleChange,
  );

  const stop = (event: ReactPointerEvent<HTMLElement>) => event.stopPropagation();

  if (type === "linear") {
    return (
      <div
        className="pfx-c-gradient-geometry pfx-is-linear"
        style={{ "--pfx-gradient-angle": angle + "deg" } as CSSProperties}
      >
        <div className="pfx-c-gradient-geometry__axis">
          <button
            ref={linearStartRef}
            type="button"
            className="pfx-c-gradient-geometry__endpoint pfx-is-start"
            onPointerDown={stop}
            onClick={(event) => event.stopPropagation()}
            aria-label="Rotate gradient from start"
          />
          <span />
          <button
            ref={linearEndRef}
            type="button"
            className="pfx-c-gradient-geometry__endpoint pfx-is-end"
            onPointerDown={stop}
            onClick={(event) => event.stopPropagation()}
            aria-label="Rotate gradient from end"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={"pfx-c-gradient-geometry pfx-is-" + type}>
      {type === "radial" && (
        <span
          className="pfx-c-gradient-geometry__radial-ring"
          style={{
            left: String(center.x * 100) + "%",
            top: String(center.y * 100) + "%",
          }}
        />
      )}

      {type === "conic" && (
        <div
          className="pfx-c-gradient-geometry__conic-arm"
          style={{
            left: String(center.x * 100) + "%",
            top: String(center.y * 100) + "%",
            "--pfx-gradient-angle": angle + "deg",
          } as CSSProperties}
        >
          <button
            ref={conicAngleRef}
            type="button"
            onPointerDown={stop}
            onClick={(event) => event.stopPropagation()}
            aria-label="Rotate conic gradient"
          />
        </div>
      )}

      <button
        ref={centerRef}
        type="button"
        className="pfx-c-gradient-geometry__center"
        style={{
          left: String(center.x * 100) + "%",
          top: String(center.y * 100) + "%",
        }}
        onPointerDown={stop}
        onClick={(event) => event.stopPropagation()}
        aria-label="Move gradient center"
      />
    </div>
  );
}

export function Gradient({
  state,
  workspace,
  sync,
  commitColor,
  saveSet,
  saveGradient,
  requestVersion,
  onRequestApplied,
}: {
  state: WorkspaceState;
  workspace: PfxColorsWorkspace;
  sync: (next?: WorkspaceState) => void;
  commitColor: (input: ColorInput) => void;
  saveSet: (name: string, colors: readonly string[]) => void;
  saveGradient: (name: string, gradient: SavedGradientDraft) => void;
  requestVersion: number;
  onRequestApplied: () => void;
}) {
  // The workspace is the single source of truth for gradient geometry. Local settings
  // only describe the initial preview before the first committed gradient.
  const [initialType] = useStoredState<GradientType>(
    "pfx-colors.gradient.type.v2", state.gradient?.type ?? "linear",
    oneOf(["linear", "radial", "conic"] as const));
  const [initialAngle] = useStoredState(
    "pfx-colors.gradient.angle.v2", state.gradient?.angle ?? 90,
    numberBetween(0, 360));
  const [initialSpace] = useStoredState<string>(
    "pfx-colors.gradient.space.v2", state.gradient?.interpolationSpace ?? "oklch",
    oneOf(["oklch", "oklab", "srgb"] as const));
  const [selectedStop, setSelectedStop] = useStoredState(
    "pfx-colors.gradient.selected-stop.v2", 0, numberBetween(0, 15));
  const [status, setStatus] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [panel, setPanel] = useState<"color" | "settings">("color");
  const [showGuides, setShowGuides] = useState(false);
  const [initialCenter] = useStoredState(
    "pfx-colors.gradient.center.v2",
    { x: state.gradient?.centerX ?? 0.5, y: state.gradient?.centerY ?? 0.5 }, validCenter);
  const type = state.gradient?.type ?? initialType;
  const angle = state.gradient?.angle ?? initialAngle;
  const space = state.gradient?.interpolationSpace ?? initialSpace;
  const center = state.gradient
    ? { x: state.gradient.centerX, y: state.gradient.centerY }
    : initialCenter;
  const railRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const rustCanvasRef = useRef<HTMLCanvasElement>(null);
  const rustWorkerRef = useRef<Worker | null>(null);
  const [rustPreviewFailed, setRustPreviewFailed] = useState(false);
  const renderRevision = useRef(0);
  const inFlight = useRef(false);
  const latestRender = useRef<{
    kind: "render";
    revision: number;
    gradient: typeof gradient;
    width: number;
    height: number;
    quality: "interactive" | "final";
  } | null>(null);
  const flushRender = useRef<() => void>(() => {});

  const fallback = useMemo(() => {
    const harmony = generateHarmony(asInput(state.color.source), "complementary");
    return createGradient(
      [
        { color: asInput(harmony.colors[0].value), position: 0 },
        { color: asInput(harmony.colors[1].value), position: 1 },
      ],
      {
        type,
        angle,
        centerX: center.x,
        centerY: center.y,
        interpolationSpace: space,
        hue: "shorter",
      },
    );
  }, [angle, center.x, center.y, space, state.color.source, type]);

  const source = state.gradient ?? fallback;
  const gradient = useMemo(
    () =>
      createGradient(
        type === "conic"
          ? prepareConicStops(source.stops.map(stop => ({
              color: asInput(stop.source), position: stop.position,
            })))
          : source.stops.map(stop => ({
              color: asInput(stop.source), position: stop.position,
            })),
        {
          type,
          angle,
          centerX: center.x,
          centerY: center.y,
          interpolationSpace: space,
          hue: "shorter",
        },
      ),
    [angle, center.x, center.y, source, space, type],
  );

  const renderGradient = useMemo(() => closeConicGradient(gradient), [gradient]);

  useEffect(() => {
    if (requestVersion === 0 || !state.gradient) return;
    setSelectedStop(0);
    onRequestApplied();
  }, [requestVersion, onRequestApplied, state.gradient]);

  useEffect(() => {
    setSelectedStop((current) =>
      Math.max(0, Math.min(current, gradient.stops.length - 1)),
    );
  }, [gradient.stops.length]);

  // Rust preview stays off the UI thread; CSS remains the safe worker fallback.
  // Keep one worker for this mounted preview and deliver only the newest
  // render during continuous pointer input; outdated frames never paint.
  useEffect(() => {
    if (!isRustEngine()) return;
    const worker = new Worker(new URL("../rust/gradient-worker.ts", import.meta.url), {
      type: "module",
    });
    rustWorkerRef.current = worker;
    const stats = {
      submitted: 0, completed: 0, painted: 0, discarded: 0,
      latestRevision: 0, paintRevision: 0, maxRustMs: 0, worker: true,
      paintedWidth: 0, paintedHeight: 0, lastQuality: "interactive",
    };
    Object.defineProperty(window, "__PFX_RUST_RENDER__", {
      value: stats, configurable: true,
    });
    flushRender.current = () => {
      if (inFlight.current || !latestRender.current) return;
      const task = latestRender.current;
      latestRender.current = null;
      inFlight.current = true;
      stats.submitted += 1;
      worker.postMessage(task);
    };
    worker.onmessage = (event: MessageEvent<{
      kind: "frame" | "error"; message?: string;
      revision: number; width: number; height: number;
      durationMs: number; pixels: ArrayBuffer;
      quality: "interactive" | "final";
    }>) => {
      if (event.data.kind === "error") {
        console.error("PFx Rust gradient worker error:", event.data.message);
        if (rustCanvasRef.current) rustCanvasRef.current.dataset.rustGradientPreview = "error";
        worker.terminate();
        rustWorkerRef.current = null;
        latestRender.current = null;
        inFlight.current = false;
        flushRender.current = () => {};
        setRustPreviewFailed(true);
        return;
      }
      inFlight.current = false;
      stats.completed += 1;
      stats.maxRustMs = Math.max(stats.maxRustMs, event.data.durationMs);
      const canvas = rustCanvasRef.current;
      // Show each newly completed frame while a drag is in progress.
      // Waiting for an exact revision match makes Firefox appear frozen
      // under continuous input because every result arrives one step behind.
      // Never paint backwards, and only declare "ready" for the final frame.
      if (canvas && canvas.isConnected && event.data.revision > stats.paintRevision) {
        canvas.width = event.data.width;
        canvas.height = event.data.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Rust canvas context unavailable");
        context.putImageData(new ImageData(
          new Uint8ClampedArray(event.data.pixels), event.data.width, event.data.height,
        ), 0, 0);
        canvas.dataset.rustGradientPreview =
          event.data.revision === renderRevision.current && event.data.quality === "final"
            ? "ready" : "pending";
        canvas.dataset.rustPreviewQuality = event.data.quality;
        stats.paintedWidth = event.data.width;
        stats.paintedHeight = event.data.height;
        stats.lastQuality = event.data.quality;
        stats.painted += 1;
        stats.paintRevision = event.data.revision;
        recordRustGradientRaster();
      } else {
        stats.discarded += 1;
      }
      flushRender.current();
    };
    worker.onerror = (event) => {
      event.preventDefault();
      console.error("PFx Rust gradient worker failed:", event.message);
      if (rustCanvasRef.current) rustCanvasRef.current.dataset.rustGradientPreview = "error";
      worker.terminate();
      rustWorkerRef.current = null;
      latestRender.current = null;
      inFlight.current = false;
      flushRender.current = () => {};
      setRustPreviewFailed(true);
    };
    worker.postMessage({
      kind: "init",
      assetRoot: new URL("rust/", document.baseURI).href,
    });
    return () => {
      worker.terminate();
      rustWorkerRef.current = null;
      inFlight.current = false;
      latestRender.current = null;
      flushRender.current = () => {};
      delete (window as Window & { __PFX_RUST_RENDER__?: unknown }).__PFX_RUST_RENDER__;
    };
  }, []);

  useEffect(() => {
    if (!isRustEngine() || !rustWorkerRef.current
      || !rustCanvasRef.current || !previewRef.current) return;
    const canvas = rustCanvasRef.current;
    const surface = previewRef.current;
    let scheduled = 0;
    let settled: ReturnType<typeof setTimeout> | undefined;
    const enqueue = (quality: "interactive" | "final") => {
      if (!canvas.isConnected) return;
      const box = surface.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return;
      const aspect = box.width / box.height;
      // The small frame keeps pointer dragging responsive; the settled frame
      // follows the real CSS size and DPR, bounded for reliable WASM throughput.
      const targetWidth = quality === "interactive"
        ? Math.max(180, Math.min(240, Math.round(box.width * 0.4)))
        : Math.min(Math.round(box.width * Math.min(window.devicePixelRatio || 1, 2)),
          1024, Math.floor(Math.sqrt(640000 * aspect)));
      const width = Math.max(1, targetWidth);
      const height = Math.max(1, Math.floor(width / aspect));
      const revision = ++renderRevision.current;
      canvas.dataset.rustGradientPreview = "pending";
      latestRender.current = {
        kind: "render", revision, gradient: renderGradient, width, height, quality,
      };
      const stats = (window as Window & {
        __PFX_RUST_RENDER__?: { latestRevision: number };
      }).__PFX_RUST_RENDER__;
      if (stats) stats.latestRevision = revision;
      flushRender.current();
    };
    const schedule = () => {
      cancelAnimationFrame(scheduled);
      if (settled !== undefined) clearTimeout(settled);
      scheduled = requestAnimationFrame(() => {
        enqueue("interactive");
        // Never queue expensive final frames during active pointer movement.
        settled = setTimeout(() => enqueue("final"), 360);
      });
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(surface);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(scheduled);
      if (settled !== undefined) clearTimeout(settled);
    };
  }, [renderGradient]);

  const css = compactGradientCss(gradientToCss(renderGradient));
  const railCss = "linear-gradient(90deg, " + gradient.stops.map(stop =>
    stop.source.css + " " + (stop.position * 100).toFixed(2) + "%").join(", ") + ")";
  const cssFile = gradientCssExport(css);
  const jsonFile = gradientExport(gradient);
  const activeStop = gradient.stops[selectedStop] ?? gradient.stops[0];
  const copy = async (text: string, label: string) => {
    setStatus(await copyColorText(text) ? label + " copied" : "Clipboard unavailable");
  };
  const saveGradientSet = () => {
    saveSet("Gradient · " + type, gradient.stops.map(stop => stop.hex));
    setStatus("Gradient colors saved to Collections");
  };
  const saveCurrentGradient = () => {
    saveGradient("Gradient · " + type, {
      type, angle, centerX: center.x, centerY: center.y,
      interpolationSpace: space,
      stops: gradient.stops.map(stop => ({
        position: stop.position,
        color: asInput(stop.source),
      })),
    });
    setStatus("Editable gradient saved to Collections");
  };

  const commitGradient = (
    stops: readonly GradientStopInput[],
    changes: Partial<{ type: GradientType; angle: number; centerX: number;
      centerY: number; interpolationSpace: string }> = {},
  ) => {
    const nextType = changes.type ?? type;
    sync(workspace.createGradient(
      nextType === "conic" ? prepareConicStops(stops) : stops,
      {
        type, angle, centerX: center.x, centerY: center.y,
        interpolationSpace: space, hue: "shorter", ...changes,
      },
    ));
  };
  const updateGeometry = (changes: Parameters<typeof commitGradient>[1]) => {
    commitGradient(gradient.stops.map(stop => ({
      color: asInput(stop.source), position: stop.position,
    })), changes);
  };

  const randomizeGradient = () => {
    const next = generateRandomGradient(gradient.stops.map(stop => stop.hex));
    setSelectedStop(0);
    setPanel("color");
    commitGradient(next.stops, {
      type: next.type, angle: next.angle,
      centerX: next.center.x, centerY: next.center.y,
    });
    setStatus("New random gradient");
  };

  const commitStops = (stops: GradientStopInput[]) => commitGradient(stops);

  const updateStopPosition = (index: number, position: number) => {
    commitStops(
      gradient.stops.map((item, itemIndex) => ({
        color: asInput(item.source),
        position: itemIndex === index && type === "conic"
          ? Math.min(position, conicEditableLimit(gradient.stops.length))
          : itemIndex === index ? position : item.position,
      })),
    );
  };

  const updateStopColor = (index: number, color: ColorInput) => {
    commitStops(
      gradient.stops.map((item, itemIndex) => ({
        color: itemIndex === index ? color : asInput(item.source),
        position: item.position,
      })),
    );
  };

  const addStopAt = (position: number) => {
    const at = Math.max(0, Math.min(
      type === "conic" ? conicEditableLimit(gradient.stops.length + 1) : 1,
      position,
    ));
    const sampled = sampleGradient(renderGradient, at);
    const insertionIndex = gradient.stops.filter(
      (stop) => stop.position <= at,
    ).length;

    commitStops([
      ...gradient.stops.map((stop) => ({
        color: asInput(stop.source),
        position: stop.position,
      })),
      { color: asInput(sampled), position: at },
    ]);
    setSelectedStop(Math.min(insertionIndex, gradient.stops.length));
  };

  const addStopNearSelection = () => {
    const previous = gradient.stops[selectedStop - 1];
    const next = gradient.stops[selectedStop + 1];
    const at = next
      ? (activeStop.position + next.position) / 2
      : previous
        ? (previous.position + activeStop.position) / 2
        : 0.5;
    addStopAt(at);
  };

  const removeStop = (index: number) => {
    if (gradient.stops.length <= 2) return;
    commitStops(
      gradient.stops
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item) => ({
          color: asInput(item.source),
          position: item.position,
        })),
    );
    setSelectedStop((current) =>
      Math.max(
        0,
        Math.min(
          current - (index <= current ? 1 : 0),
          gradient.stops.length - 2,
        ),
      ),
    );
  };

  const reverseGradient = () => {
    commitStops(
      gradient.stops.map((stop) => ({
        color: asInput(stop.source),
        position: type === "conic"
          ? gradient.stops[gradient.stops.length - 1].position - stop.position
          : 1 - stop.position,
      })),
    );
    setSelectedStop(gradient.stops.length - 1 - selectedStop);
  };

  const handleRailPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    addStopAt((event.clientX - rect.left) / rect.width);
  };

  const nudgeActiveStop = (direction: -1 | 1) => {
    const previous = gradient.stops[selectedStop - 1];
    const next = gradient.stops[selectedStop + 1];
    const min = previous ? previous.position + 0.005 : 0;
    const max = next ? next.position - 0.005
      : type === "conic" ? conicEditableLimit(gradient.stops.length) : 1;

    updateStopPosition(
      selectedStop,
      Math.max(
        min,
        Math.min(max, activeStop.position + direction * 0.01),
      ),
    );
  };

  return (
    <section className="pfx-c-workbench pfx-c-workbench--gradient pfx-v2__page pfx-gstudio"
      aria-label="Gradient editor">
      <header className="pfx-gstudio__header">
        <div className="pfx-gstudio__identity">
          <span className="pfx-gstudio__symbol" style={{ background: css }} aria-hidden="true" />
          <div><strong>Gradient</strong><span>Color studio</span></div>
        </div>
        <div className="pfx-gstudio__commands">
          <button className="pfx-gstudio__new" type="button" onClick={randomizeGradient}
            aria-label="Random gradient" title="Generate new gradient">
            <span aria-hidden="true">↻</span> New
          </button>
          <button className="pfx-gstudio__main-command" type="button"
            onClick={() => void copy(css, "Gradient CSS")}>Copy CSS</button>
          <div className="pfx-gstudio__command-menu">
            <button type="button" aria-expanded={showSave}
              aria-controls="pfx-gradient-save-menu"
              onClick={() => { setShowExport(false); setShowSave(value => !value); }}>Save <span aria-hidden="true">⌄</span></button>
            {showSave && <div className="pfx-gstudio__menu" id="pfx-gradient-save-menu" role="group" aria-label="Save options">
              <button type="button" onClick={() => { saveCurrentGradient(); setShowSave(false); }}>Save gradient</button>
              <button type="button" onClick={() => { saveGradientSet(); setShowSave(false); }}>Save colors</button>
            </div>}
          </div>
          <div className="pfx-gstudio__command-menu">
            <button type="button" aria-expanded={showExport}
              aria-controls="pfx-gradient-export-menu"
              onClick={() => { setShowSave(false); setShowExport(value => !value); }}>Export <span aria-hidden="true">⌄</span></button>
            {showExport && <div className="pfx-gstudio__menu" id="pfx-gradient-export-menu" role="group" aria-label="Export options">
              <button type="button" onClick={() => { downloadText("pfx-gradient.css", cssFile, "text/css;charset=utf-8"); setShowExport(false); }}>Download CSS</button>
              <button type="button" onClick={() => { downloadText("pfx-gradient.json", jsonFile, "application/json;charset=utf-8"); setShowExport(false); }}>Download JSON</button>
              <button type="button" onClick={() => void copy(jsonFile, "Gradient JSON")}>Copy JSON</button>
            </div>}
          </div>
        </div>
      </header>

      <div className={"pfx-gstudio__workspace" + (panel ? " pfx-gstudio__workspace--editing" : "")}>
        <div className="pfx-gstudio__artboard">
          <div className="pfx-gstudio__toolstrip">
            <div className="pfx-gstudio__types" role="group" aria-label="Gradient type">
              {(["linear", "radial", "conic"] as GradientType[]).map(item => (
                <button key={item} type="button" className={type === item ? "is-active" : ""}
                  onClick={() => updateGeometry({ type: item })} aria-label={item + " gradient"}
                  aria-pressed={type === item}>
                  <GradientTypeGlyph type={item} /><span>{item[0].toUpperCase() + item.slice(1)}</span>
                </button>
              ))}
            </div>
            <div className="pfx-gstudio__geometry-tools">
              {type !== "radial" && (
                <label className="pfx-gstudio__angle" htmlFor="pfx-gradient-angle">
                  <span>Angle</span>
                  <input id="pfx-gradient-angle" type="range" min="0" max="359" step="1"
                    aria-label="Gradient angle" value={Math.round(angle)}
                    onChange={event => updateGeometry({ angle: Number(event.target.value) })} />
                  <output>{Math.round(angle)}°</output>
                </label>
              )}
              <button type="button" className={"pfx-gstudio__guide-toggle" + (showGuides ? " is-active" : "")}
                aria-pressed={showGuides} onClick={() => setShowGuides(value => !value)}
                title="Edit direction and center on the canvas">
                <span aria-hidden="true">⌖</span> Guides
              </button>
              <button className={"pfx-gstudio__advanced-toggle" + (panel === "settings" ? " is-active" : "")}
                type="button" onClick={() => setPanel(value => value === "settings" ? "color" : "settings")}
                aria-pressed={panel === "settings"}>Settings <span aria-hidden="true">⚙</span></button>
            </div>
          </div>

          <div className="pfx-gstudio__canvas-wrap">
            <div ref={previewRef} className="pfx-c-gradient-preview pfx-gstudio__canvas"
              style={{ background: isRustEngine() && !rustPreviewFailed ? "transparent" : css }}
              onClick={event => {
                if (event.target !== event.currentTarget) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const point = {
                  x: (event.clientX - rect.left) / rect.width,
                  y: (event.clientY - rect.top) / rect.height,
                };
                const at = type === "conic"
                  ? ((angleFromNormalizedPoint(point, center, rect.width, rect.height) - angle + 360) % 360) / 360
                  : Math.max(0, Math.min(1, point.x));
                commitColor(asInput(sampleGradient(renderGradient, at)));
              }}
              aria-label="Live gradient preview">
              {isRustEngine() && !rustPreviewFailed && (
                <canvas ref={rustCanvasRef} aria-hidden="true" data-rust-gradient-preview="pending"
                  style={{
                    position: "absolute", inset: 0, width: "100%", height: "100%",
                    pointerEvents: "none", borderRadius: "inherit",
                  }} />
              )}
              {showGuides && <GradientCanvasGeometry surfaceRef={previewRef} type={type}
                angle={angle} center={center}
                onAngleChange={value => updateGeometry({ angle: value })}
                onCenterChange={point => updateGeometry({ centerX: point.x, centerY: point.y })} />}
              {showGuides && type !== "radial" && <output className="pfx-c-gradient-preview__angle">
                {String(Math.round(angle)).padStart(3, "0")}°
              </output>}
              <span className="pfx-gstudio__canvas-caption" aria-hidden="true">
                {type} <span>·</span> {gradient.stops.length} colors
              </span>
            </div>
          </div>

          <div className="pfx-gstudio__colors">
            <div className="pfx-gstudio__colors-bar">
              <div><strong>Colors</strong><span>Choose a point to edit</span></div>
              <div className="pfx-gstudio__stop-actions">
                <button type="button" onClick={addStopNearSelection} aria-label="Add gradient stop" title="Add color">+ Add</button>
                <button type="button" onClick={reverseGradient} aria-label="Reverse gradient" title="Reverse colors">⇄ Reverse</button>
              </div>
            </div>
            <div className="pfx-c-gradient-stop-strip pfx-gstudio__stop-strip">
              <div ref={railRef} className="pfx-c-gradient-rail pfx-gstudio__rail"
                style={{ "--pfx-gradient": railCss } as CSSProperties}
                onPointerDown={handleRailPointerDown} aria-label="Gradient stops">
                <span className="pfx-c-gradient-rail__line" />
                {gradient.stops.map((stop, index) => {
                  const previous = gradient.stops[index - 1];
                  const next = gradient.stops[index + 1];
                  const min = previous ? previous.position + 0.005 : 0;
                  const max = next ? next.position - 0.005
                    : type === "conic" ? conicEditableLimit(gradient.stops.length) : 1;
                  return <GradientStopHandle key={index} railRef={railRef} index={index}
                    position={stop.position} hex={stop.hex} min={min} max={max}
                    selected={selectedStop === index && panel === "color"}
                    onChange={value => updateStopPosition(index, value)}
                    onSelect={() => { setSelectedStop(index); setPanel("color"); }} />;
                })}
              </div>
            </div>
            <div className="pfx-gstudio__swatches" role="group" aria-label="Gradient colors">
              {gradient.stops.map((stop, index) => (
                <button key={index} type="button"
                  className={selectedStop === index && panel === "color" ? "is-selected" : ""}
                  aria-label={"Edit color " + (index + 1)}
                  aria-pressed={selectedStop === index && panel === "color"}
                  onClick={() => { setSelectedStop(index); setPanel("color"); }}>
                  <span className="pfx-gstudio__swatch" style={{ background: stop.source.css }} />
                  <span className="pfx-gstudio__swatch-value">{stop.hex.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {panel && (
          <aside className="pfx-gstudio__inspector" aria-label={panel === "color" ? "Color editor" : "Advanced settings"}>
            <div className="pfx-gstudio__inspector-head">
              <div>
                <span>{panel === "color" ? "POINT " + (selectedStop + 1) + " OF " + gradient.stops.length : "GRADIENT"}</span>
                <strong>{panel === "color" ? "Edit color" : "Settings"}</strong>
              </div>
              {panel === "settings" && <button type="button" onClick={() => setPanel("color")}
                aria-label="Back to color editor" title="Back to color editor">←</button>}
            </div>
            {panel === "color" ? (
              <div className="pfx-gstudio__inspector-body">
                <div className="pfx-gstudio__selected-swatch" style={{ background: activeStop.source.css }}>
                  <span>Selected color</span>
                </div>
                <GradientColorEditor color={activeStop.source}
                  onChange={value => updateStopColor(selectedStop, value)} />
                <div className="pfx-gstudio__editor-buttons">
                  <button type="button" onClick={() => void copy(activeStop.hex.toUpperCase(), "Stop HEX")}>Copy stop HEX</button>
                  <button type="button" onClick={() => updateStopColor(selectedStop, asInput(state.color.source))}>Use current color</button>
                </div>
                <div className="pfx-gstudio__position">
                  <label>Position</label>
                  <div className="pfx-c-gradient-position">
                    <button type="button" onClick={() => nudgeActiveStop(-1)} aria-label="Move selected stop left">−</button>
                    <output>{Math.round(activeStop.position * 100)}%</output>
                    <button type="button" onClick={() => nudgeActiveStop(1)} aria-label="Move selected stop right">+</button>
                  </div>
                </div>
                <button className="pfx-gstudio__remove" type="button"
                  disabled={gradient.stops.length <= 2}
                  onClick={() => removeStop(selectedStop)}
                  aria-label="Remove selected stop">Remove color</button>
              </div>
            ) : (
              <div className="pfx-gstudio__inspector-body pfx-gstudio__settings-body">
                <div className="pfx-gstudio__settings-group">
                  <strong>Color interpolation</strong>
                  <span>How colors blend between points</span>
                  <div className="pfx-gstudio__spaces" role="group" aria-label="Interpolation space">
                    {([
                      ["oklch", "OKLCH"],
                      ["oklab", "OKLAB"],
                      ["srgb", "RGB"],
                    ] as const).map(([value, label]) => (
                      <button key={value} type="button" className={space === value ? "is-active" : ""}
                        aria-pressed={space === value}
                        onClick={() => updateGeometry({ interpolationSpace: value })}>{label}</button>
                    ))}
                  </div>
                </div>
                <div className="pfx-gstudio__settings-group">
                  <strong>Position and direction</strong>
                  <span>Drag the handles directly on the canvas</span>
                  <button type="button" className="pfx-gstudio__setting-action"
                    onClick={() => { setShowGuides(true); setPanel("color"); }}>
                    Show canvas guides <span aria-hidden="true">↗</span>
                  </button>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      <footer className="pfx-gstudio__footer">
        <details className="pfx-gstudio__source">
          <summary>CSS code <span aria-hidden="true">⌄</span></summary>
          <div className="pfx-gradient__css"><code title={css}>{css}</code></div>
        </details>
        <p role="status" aria-live="polite">{status}</p>
      </footer>
    </section>
  );
}
