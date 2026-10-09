import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { ColorInput, ColorValue } from "@pfx/color-core";
import {
  colorEngine, createGradient, generateColorStudy, generateHarmony,
  generateTonalPalette, gradientToCss, sampleGradient,
  isRustEngine, recordRustGradientRaster,
} from "../rust/operations";
import {
  type GradientStopInput,
  type GradientType,
} from "@pfx/color-core";
import { useNormalizedDragSurface } from "../interaction/use-normalized-drag-surface";
import { useHorizontalTrackDrag } from "../interaction/use-horizontal-track-drag";
import { useAngleHandleDrag, useNormalizedHandleDrag } from "../interaction/use-gradient-geometry";
import { PfxColorsWorkspace, type WorkspaceState } from "@pfx/color-core";
import type { WorkspaceFactory } from "../rust/loader";
import { WorkspaceShell, TOOLS, type ToolId } from "./workspace-shell";
import { useTheme } from "./use-theme";
import { useColorLibrary } from "./use-color-library";
import { Explore } from "./explore";
import { Collections } from "./collections";
import { Tones } from "./tones";
import { Picker } from "./picker";
import { Harmony } from "./harmony";

function asInput(value: ColorValue): ColorInput {
  return {
    space: value.space,
    coordinates: value.coordinates.map((coordinate) => coordinate ?? 0),
    alpha: value.alpha,
  };
}

function round(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  return Number(value.toFixed(digits)).toString();
}

function createStudyRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function useWorkspace(workspaceFactory?: WorkspaceFactory) {
  const ref = useRef<PfxColorsWorkspace | null>(null);
  if (!ref.current) {
    let initial = "#ff0014";
    try {
      initial = localStorage.getItem("pfx-colors.current") ?? initial;
    } catch {
      // ignore
    }
    ref.current = workspaceFactory ? workspaceFactory(initial) : new PfxColorsWorkspace(initial);
  }

  const workspace = ref.current;
  const [state, setState] = useState<WorkspaceState>(() => workspace.getState());
  const sync = useCallback(
    (next?: WorkspaceState) => setState(next ?? workspace.getState()),
    [workspace],
  );

  return { workspace, state, sync };
}

export function App({
  workspaceFactory,
  engine = "legacy",
}: {
  workspaceFactory?: WorkspaceFactory;
  engine?: "legacy" | "rust";
} = {}) {
  const { workspace, state, sync } = useWorkspace(workspaceFactory);
  const [activeTool, setActiveTool] = useState<ToolId>("home");
  const { theme, preference, setPreference } = useTheme();
  const library = useColorLibrary();

  const commitColor = useCallback(
    (input: ColorInput) => {
      const next = workspace.setColor(input);
      try { localStorage.setItem("pfx-colors.current", next.color.hex); }
      catch { /* storage unavailable */ }
      library.addRecent(next.color.hex);
      sync(next);
    },
    [sync, workspace, library.addRecent],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "SELECT" ||
        target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (!isTyping && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        sync(event.shiftKey ? workspace.redo() : workspace.undo());
        return;
      }
      if (!isTyping && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const match = TOOLS.find(item => item.key === event.key);
        if (match) setActiveTool(match.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sync, workspace]);

  const openTones = (hex: string) => {
    commitColor(hex);
    setActiveTool("tones");
  };

  return (
    <WorkspaceShell
      engine={engine}
      activeTool={activeTool}
      navigate={setActiveTool}
      theme={theme}
      preference={preference}
      setPreference={setPreference}
      currentHex={state.color.hex}
      currentInput={<CurrentColorInput value={state.color.hex} commitColor={commitColor} />}
      gamut={state.color.gamut}
      canUndo={workspace.canUndo()}
      canRedo={workspace.canRedo()}
      undo={() => sync(workspace.undo())}
      redo={() => sync(workspace.redo())}
    >
      {activeTool === "home" && <Home state={state} commitColor={commitColor} />}
      {activeTool === "explore" && (
        <Explore
          activeHex={state.color.hex}
          select={commitColor}
          openTones={openTones}
          favorites={library.favorites}
          toggleFavorite={library.toggleFavorite}
        />
      )}
      {activeTool === "picker" && <Picker state={state} commitColor={commitColor} openTones={openTones}
        favorite={library.favorites.includes(state.color.hex.toLowerCase())}
        toggleFavorite={library.toggleFavorite} />}
      {activeTool === "tones" && (
        <Tones state={state} workspace={workspace} sync={sync}
          commitColor={commitColor} openGradient={() => setActiveTool("gradient")} />
      )}
      {activeTool === "harmony" && (
        <Harmony state={state} workspace={workspace} sync={sync}
          commitColor={commitColor} openGradient={() => setActiveTool("gradient")}
          saveSet={library.saveSet} favorites={library.favorites}
          toggleFavorite={library.toggleFavorite} />
      )}
      {activeTool === "gradient" && (
        <Gradient state={state} workspace={workspace} sync={sync} commitColor={commitColor} />
      )}
      {activeTool === "collections" && (
        <Collections currentHex={state.color.hex} favorites={library.favorites}
          recent={library.recent} sets={library.sets} removeSet={library.removeSet}
          select={commitColor} openTones={openTones}
          toggleFavorite={library.toggleFavorite} clearRecent={library.clearRecent} />
      )}
    </WorkspaceShell>
  );
}

type StudyControlId = "lightness" | "chroma" | "hueRange" | "toneRange";

const STUDY_CONTROLS: Array<{
  id: StudyControlId;
  label: string;
  high: string;
  low: string;
}> = [
  { id: "lightness", label: "LIGHTNESS", high: "LIGHT", low: "DARK" },
  { id: "chroma", label: "CHROMA", high: "VIVID", low: "MUTED" },
  { id: "hueRange", label: "HUE RANGE", high: "WIDE", low: "TIGHT" },
  { id: "toneRange", label: "TONE RANGE", high: "WIDE", low: "TIGHT" },
];

function studyControlState(control: StudyControlId, value: number) {
  if (control === "lightness") {
    return value < 34 ? "DARK" : value < 67 ? "MID" : "LIGHT";
  }
  if (control === "chroma") {
    return value < 34 ? "MUTED" : value < 67 ? "BALANCED" : "VIVID";
  }
  return value < 34 ? "TIGHT" : value < 67 ? "BALANCED" : "WIDE";
}

function Home({
  state,
  commitColor,
}: {
  state: WorkspaceState;
  commitColor: (input: ColorInput) => void;
}) {
  const [controls, setControls] = useState<Record<StudyControlId, number>>({
    lightness: 58,
    chroma: 58,
    hueRange: 58,
    toneRange: 58,
  });
  const [activeControl, setActiveControl] =
    useState<StudyControlId>("lightness");
  const [generation, setGeneration] = useState(1);
  const [studySeed, setStudySeed] = useState(state.color.hex);
  const [activeColorIndex, setActiveColorIndex] = useState<number | null>(null);
  const [randomSeed, setRandomSeed] = useState(() =>
    Math.floor(Math.random() * 0x7fffffff),
  );

  const study = useMemo(
    () =>
      generateColorStudy(studySeed, {
        ...controls,
        random: createStudyRandom(randomSeed),
      }),
    [controls, randomSeed, studySeed],
  );

  const regenerate = () => {
    setStudySeed(state.color.hex);
    setRandomSeed(Math.floor(Math.random() * 0x7fffffff));
    setGeneration((value) => value + 1);
    setActiveColorIndex(null);
  };

  const activeSetting =
    STUDY_CONTROLS.find((control) => control.id === activeControl) ??
    STUDY_CONTROLS[0];
  const activeValue = controls[activeControl];
  const activeState = studyControlState(activeControl, activeValue);

  const updateActiveControl = (value: number) => {
    setControls((current) => ({
      ...current,
      [activeControl]: value,
    }));
  };

  return (
    <section className="pfx-c-home">
      <div className="pfx-c-home__canvas">
        <div className="pfx-c-home__study-zone">
          <article className="pfx-c-study">
            <header className="pfx-c-study__head">
              <div
                className="pfx-c-study__future-area"
                data-future-slot="generator-toolbar"
                aria-hidden="true"
              />

              <button
                type="button"
                className="pfx-c-study__generate"
                onClick={regenerate}
              >
                <span>GENERATE</span>
                <small>#{String(generation).padStart(2, "0")}</small>
              </button>
            </header>

            <div className="pfx-c-study__body">
              <div
                className="pfx-c-study__colors"
                aria-label="Generated color study"
              >
                {study.colors.map((color) => (
                  <button
                    key={generation + "-" + color.index + "-" + color.hex}
                    type="button"
                    className={
                      "pfx-c-study__swatch" +
                      (activeColorIndex === color.index ? " pfx-is-active" : "")
                    }
                    style={{ background: color.hex }}
                    onClick={() => {
                      setActiveColorIndex(color.index);
                      commitColor(asInput(color.value));
                    }}
                    aria-pressed={activeColorIndex === color.index}
                    aria-label={"Use generated color " + color.hex}
                  >
                    <span>{String(color.index + 1).padStart(2, "0")}</span>
                    <strong>{color.hex.toUpperCase()}</strong>
                  </button>
                ))}
              </div>

              <aside className="pfx-c-tensor">
                <div className="pfx-c-tensor__head">
                  <span>{activeSetting.label}</span>
                  <strong>{String(activeValue).padStart(3, "0")}</strong>
                </div>

                <div className="pfx-c-tensor__rail">
                  <span className="pfx-c-tensor__high">
                    {activeSetting.high}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={activeValue}
                    onChange={(event) =>
                      updateActiveControl(Number(event.target.value))
                    }
                    aria-label={activeSetting.label + " control"}
                  />
                  <span className="pfx-c-tensor__low">
                    {activeSetting.low}
                  </span>
                  <i
                    className="pfx-c-tensor__meter"
                    style={{ height: activeValue + "%" }}
                  />
                </div>

                <div className="pfx-c-tensor__state">
                  <span>{activeState}</span>
                </div>
              </aside>

              <aside
                className="pfx-c-study__controls"
                aria-label="Palette controls"
              >
                {STUDY_CONTROLS.map((control, index) => (
                  <button
                    key={control.id}
                    type="button"
                    className={
                      "pfx-c-study__control-slot" +
                      (activeControl === control.id ? " pfx-is-active" : "")
                    }
                    data-control-slot={index + 1}
                    aria-pressed={activeControl === control.id}
                    onClick={() => setActiveControl(control.id)}
                  >
                    <small>{String(index + 1).padStart(2, "0")}</small>
                    <span>{control.label}</span>
                    <strong>
                      {String(controls[control.id]).padStart(3, "0")}
                    </strong>
                  </button>
                ))}
              </aside>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function CurrentColorInput({
  value,
  commitColor,
}: {
  value: string;
  commitColor: (input: ColorInput) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const apply = () => {
    try {
      commitColor(draft);
    } catch {
      setDraft(value);
    }
  };

  return (
    <input
      className="pfx-c-current__input"
      value={draft}
      spellCheck={false}
      aria-label="Current color"
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
        onSelect();
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
            left: String(saturation) + "%",
            top: String(100 - lightness) + "%",
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

function Gradient({
  state,
  workspace,
  sync,
  commitColor,
}: {
  state: WorkspaceState;
  workspace: PfxColorsWorkspace;
  sync: (next?: WorkspaceState) => void;
  commitColor: (input: ColorInput) => void;
}) {
  const [type, setType] = useState<GradientType>("linear");
  const [angle, setAngle] = useState(90);
  const [space, setSpace] = useState("oklch");
  const [selectedStop, setSelectedStop] = useState(0);
  const [center, setCenter] = useState(() => ({
    x: state.gradient?.centerX ?? 0.5,
    y: state.gradient?.centerY ?? 0.5,
  }));
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
        source.stops.map((stop) => ({
          color: asInput(stop.source),
          position: stop.position,
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
          event.data.revision === renderRevision.current ? "ready" : "pending";
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
    const schedule = () => {
      cancelAnimationFrame(scheduled);
      scheduled = requestAnimationFrame(() => {
        if (!canvas.isConnected) return;
        const box = surface.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) return;
        const width = 160;
        const height = Math.max(1, Math.min(180, Math.round(width * box.height / box.width)));
        const revision = ++renderRevision.current;
        canvas.dataset.rustGradientPreview = "pending";
        latestRender.current = { kind: "render", revision, gradient, width, height };
        const stats = (window as Window & {
          __PFX_RUST_RENDER__?: { latestRevision: number };
        }).__PFX_RUST_RENDER__;
        if (stats) stats.latestRevision = revision;
        flushRender.current();
      });
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(surface);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(scheduled);
    };
  }, [gradient]);

  const css = gradientToCss(gradient);
  const activeStop = gradient.stops[selectedStop] ?? gradient.stops[0];

  const commitStops = (stops: GradientStopInput[]) => {
    sync(
      workspace.createGradient(stops, {
        type,
        angle,
        centerX: center.x,
        centerY: center.y,
        interpolationSpace: space,
        hue: "shorter",
      }),
    );
  };

  const updateStopPosition = (index: number, position: number) => {
    commitStops(
      gradient.stops.map((item, itemIndex) => ({
        color: asInput(item.source),
        position: itemIndex === index ? position : item.position,
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
    const at = Math.max(0, Math.min(1, position));
    const sampled = sampleGradient(gradient, at);
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
        position: 1 - stop.position,
      })),
    );
    setSelectedStop(gradient.stops.length - 1 - selectedStop);
  };

  const handleRailPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    addStopAt((event.clientX - rect.left) / rect.width);
  };

  const nudgeActiveStop = (direction: -1 | 1) => {
    const previous = gradient.stops[selectedStop - 1];
    const next = gradient.stops[selectedStop + 1];
    const min = previous ? previous.position + 0.005 : 0;
    const max = next ? next.position - 0.005 : 1;

    updateStopPosition(
      selectedStop,
      Math.max(
        min,
        Math.min(max, activeStop.position + direction * 0.01),
      ),
    );
  };

  return (
    <section className="pfx-c-workbench pfx-c-workbench--gradient">
      <div className="pfx-c-gradient-shell">
        <div className="pfx-c-gradient-canvas-card">
          <div
            ref={previewRef}
            className="pfx-c-gradient-preview"
            style={{ background: isRustEngine() && !rustPreviewFailed ? "transparent" : css }}
            onClick={(event) => {
              if (event.target !== event.currentTarget) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const at = Math.max(
                0,
                Math.min(1, (event.clientX - rect.left) / rect.width),
              );
              commitColor(asInput(sampleGradient(gradient, at)));
            }}
          >
            {isRustEngine() && !rustPreviewFailed && (
              <canvas
                ref={rustCanvasRef}
                aria-hidden="true"
                data-rust-gradient-preview="pending"
                style={{
                  position: "absolute", inset: 0,
                  width: "100%", height: "100%", pointerEvents: "none",
                  borderRadius: "inherit",
                }}
              />
            )}
            <GradientCanvasGeometry
              surfaceRef={previewRef}
              type={type}
              angle={angle}
              center={center}
              onAngleChange={setAngle}
              onCenterChange={setCenter}
            />

            {type !== "radial" && (
              <output className="pfx-c-gradient-preview__angle">
                {String(Math.round(angle)).padStart(3, "0")}°
              </output>
            )}
          </div>

          <div className="pfx-c-gradient-stop-strip">
            <div
              ref={railRef}
              className="pfx-c-gradient-rail"
              style={{ "--pfx-gradient": css } as CSSProperties}
              onPointerDown={handleRailPointerDown}
              aria-label="Gradient stops"
            >
              <span className="pfx-c-gradient-rail__line" />
              {gradient.stops.map((stop, index) => {
                const previous = gradient.stops[index - 1];
                const next = gradient.stops[index + 1];
                const min = previous ? previous.position + 0.005 : 0;
                const max = next ? next.position - 0.005 : 1;

                return (
                  <GradientStopHandle
                    key={index}
                    railRef={railRef}
                    index={index}
                    position={stop.position}
                    hex={stop.hex}
                    min={min}
                    max={max}
                    selected={selectedStop === index}
                    onChange={(value) => updateStopPosition(index, value)}
                    onSelect={() => setSelectedStop(index)}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <aside className="pfx-c-gradient-inspector">
          <div className="pfx-c-gradient-types" aria-label="Gradient type">
            {(["linear", "radial", "conic"] as GradientType[]).map((item) => (
              <button
                key={item}
                type="button"
                className={item === type ? "pfx-is-current" : ""}
                onClick={() => setType(item)}
                aria-label={item + " gradient"}
                aria-pressed={item === type}
                title={item}
              >
                <GradientTypeGlyph type={item} />
              </button>
            ))}
          </div>

          {activeStop && (
            <GradientColorEditor
              color={activeStop.source}
              onChange={(value) => updateStopColor(selectedStop, value)}
            />
          )}

          <div className="pfx-c-gradient-position">
            <button
              type="button"
              onClick={() => nudgeActiveStop(-1)}
              aria-label="Move selected stop left"
            >
              −
            </button>
            <output>
              {String(Math.round(activeStop.position * 100)).padStart(3, "0")}%
            </output>
            <button
              type="button"
              onClick={() => nudgeActiveStop(1)}
              aria-label="Move selected stop right"
            >
              +
            </button>
          </div>

          <div className="pfx-c-gradient-actions">
            <button
              type="button"
              onClick={addStopNearSelection}
              aria-label="Add gradient stop"
              title="Add stop"
            >
              +
            </button>
            <button
              type="button"
              onClick={reverseGradient}
              aria-label="Reverse gradient"
              title="Reverse"
            >
              ⇄
            </button>
            <button
              type="button"
              onClick={() => removeStop(selectedStop)}
              disabled={gradient.stops.length <= 2}
              aria-label="Remove selected stop"
              title="Remove stop"
            >
              ×
            </button>
          </div>

          <div className="pfx-c-gradient-space-grid" aria-label="Interpolation space">
            {[
              ["oklch", "OKLCH"],
              ["oklab", "OKLAB"],
              ["srgb", "RGB"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={space === value ? "pfx-is-current" : ""}
                onClick={() => setSpace(value)}
                aria-pressed={space === value}
              >
                {label}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
