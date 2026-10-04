import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { ColorInput, ColorValue } from "../engine";
import {
  createGradient,
  generateColorStudy,
  generateHarmony,
  generateTonalPalette,
  gradientToCss,
  HARMONY_SCHEMES,
  sampleGradient,
  type GradientStopInput,
  type GradientType,
  type HarmonyScheme,
} from "../tools";
import { PfxColorsWorkspace, type WorkspaceState } from "../workspace";

type ToolId = "home" | "picker" | "palette" | "harmony" | "gradient";

const tools: Array<{ id: ToolId; label: string; key: string }> = [
  { id: "home", label: "Home", key: "0" },
  { id: "picker", label: "Picker", key: "1" },
  { id: "palette", label: "Palette", key: "2" },
  { id: "harmony", label: "Harmony", key: "3" },
  { id: "gradient", label: "Gradient", key: "4" },
];

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

function useWorkspace() {
  const ref = useRef<PfxColorsWorkspace | null>(null);
  if (!ref.current) {
    let initial = "#ff0014";
    try {
      initial = localStorage.getItem("pfx-colors.current") ?? initial;
    } catch {
      // ignore
    }
    ref.current = new PfxColorsWorkspace(initial);
  }

  const workspace = ref.current;
  const [state, setState] = useState<WorkspaceState>(() => workspace.getState());
  const sync = useCallback(
    (next?: WorkspaceState) => setState(next ?? workspace.getState()),
    [workspace],
  );

  return { workspace, state, sync };
}

export function App() {
  const { workspace, state, sync } = useWorkspace();
  const [activeTool, setActiveTool] = useState<ToolId>("home");

  const commitColor = useCallback(
    (input: ColorInput) => {
      const next = workspace.setColor(input);
      try {
        localStorage.setItem("pfx-colors.current", next.color.hex);
      } catch {
        // ignore
      }
      sync(next);
    },
    [sync, workspace],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "SELECT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        sync(event.shiftKey ? workspace.redo() : workspace.undo());
        return;
      }

      if (!isTyping && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const match = tools.find((item) => item.key === event.key);
        if (match) setActiveTool(match.id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sync, workspace]);

  return (
    <div className="pfx-l-app">
      <header className="pfx-c-header">
        <div className="pfx-c-brand">
          <img src="./logo.svg" alt="" />
          <strong>PFx Colors</strong>
          <span>WORKSPACE</span>
        </div>

        <nav className="pfx-c-tabs" aria-label="Color tools">
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className={activeTool === tool.id ? "pfx-is-current" : ""}
              onClick={() => setActiveTool(tool.id)}
            >
              <span>{tool.label}</span>
              <kbd>{tool.key}</kbd>
            </button>
          ))}
        </nav>

        <div className="pfx-c-engine-label">OKLCH / P3</div>
      </header>

      <main className="pfx-l-stage">
        {activeTool === "home" && (
          <Home state={state} commitColor={commitColor} />
        )}
        {activeTool === "picker" && (
          <Picker state={state} commitColor={commitColor} />
        )}
        {activeTool === "palette" && (
          <Palette
            state={state}
            workspace={workspace}
            sync={sync}
            commitColor={commitColor}
            openGradient={() => setActiveTool("gradient")}
          />
        )}
        {activeTool === "harmony" && (
          <Harmony
            state={state}
            workspace={workspace}
            sync={sync}
            commitColor={commitColor}
            openGradient={() => setActiveTool("gradient")}
          />
        )}
        {activeTool === "gradient" && (
          <Gradient
            state={state}
            workspace={workspace}
            sync={sync}
            commitColor={commitColor}
          />
        )}
      </main>

      <footer className="pfx-c-dock">
        <div className="pfx-c-current">
          <span style={{ background: state.color.hex }} />
          <div>
            <small>CURRENT</small>
            <CurrentColorInput value={state.color.hex} commitColor={commitColor} />
          </div>
        </div>

        <div className="pfx-c-gamut">
          <span>sRGB {state.color.gamut.srgb ? "●" : "○"}</span>
          <span>P3 {state.color.gamut.p3 ? "●" : "○"}</span>
        </div>

        <div className="pfx-c-history">
          <button
            type="button"
            disabled={!workspace.canUndo()}
            onClick={() => sync(workspace.undo())}
          >
            ↶ UNDO
          </button>
          <button
            type="button"
            disabled={!workspace.canRedo()}
            onClick={() => sync(workspace.redo())}
          >
            ↷ REDO
          </button>
        </div>
      </footer>
    </div>
  );
}

function Home({
  state,
  commitColor,
}: {
  state: WorkspaceState;
  commitColor: (input: ColorInput) => void;
}) {
  const [study, setStudy] = useState(() =>
    generateColorStudy(asInput(state.color.source)),
  );
  const [generation, setGeneration] = useState(1);

  const regenerate = () => {
    setStudy(generateColorStudy(asInput(state.color.source)));
    setGeneration((value) => value + 1);
  };

  return (
    <section className="pfx-c-home">
      <div className="pfx-c-home__canvas">
        <article className="pfx-c-study">
          <header className="pfx-c-study__head">
            <div className="pfx-c-study__title">
              <span>COLOR STUDY / 10</span>
              <strong>Guided random.</strong>
            </div>

            <div className="pfx-c-study__meta">
              <span>
                <small>SEED</small>
                {study.seedHex.toUpperCase()}
              </span>
              <span>
                <small>STRUCTURE</small>
                {study.scheme.replaceAll("-", " ").toUpperCase()}
              </span>
              <span>
                <small>SPACE</small>
                OKLCH → sRGB
              </span>
            </div>

            <button
              type="button"
              className="pfx-c-study__generate"
              onClick={regenerate}
            >
              <span>GENERATE 10</span>
              <small>#{String(generation).padStart(2, "0")}</small>
            </button>
          </header>

          <div className="pfx-c-study__colors" aria-label="Generated color study">
            {study.colors.map((color) => (
              <button
                key={generation + "-" + color.index + "-" + color.hex}
                type="button"
                className="pfx-c-study__swatch"
                style={{
                  background: color.hex,
                  flexGrow: 0.8 + color.oklch.c * 3.2,
                }}
                onClick={() => commitColor(asInput(color.value))}
                aria-label={"Use generated color " + color.hex}
              >
                <span>{String(color.index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{color.hex.toUpperCase()}</strong>
                  <small>
                    L {round(color.oklch.l, 2)} · C {round(color.oklch.c, 2)}
                  </small>
                </div>
              </button>
            ))}
          </div>

          <footer className="pfx-c-study__foot">
            <span>
              HARMONY GEOMETRY
              <i />
              LIGHTNESS SPREAD
              <i />
              CHROMA BALANCE
              <i />
              GAMUT SAFE
            </span>
            <small>CLICK A COLOR TO MAKE IT CURRENT</small>
          </footer>
        </article>

        <div className="pfx-c-home__future-space" aria-hidden="true">
          <span>PFx / COLOR WORKSPACE</span>
          <i />
        </div>
      </div>
    </section>
  );
}

function Picker({
  state,
  commitColor,
}: {
  state: WorkspaceState;
  commitColor: (input: ColorInput) => void;
}) {
  const hsl = state.color.values.hsl;
  const oklch = state.color.values.oklch;
  const hue = Number(hsl?.coordinates[0] ?? 0);
  const saturation = Number(hsl?.coordinates[1] ?? 0);
  const lightness = Number(hsl?.coordinates[2] ?? 0);

  const update = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    commitColor(
      "hsl(" +
        round(hue) +
        " " +
        round(x * 100) +
        "% " +
        round((1 - y) * 100) +
        "%)",
    );
  };

  const fieldStyle = { "--pfx-hue": String(hue) } as CSSProperties;

  return (
    <section className="pfx-c-workbench pfx-c-workbench--picker">
      <div
        className="pfx-c-color-field"
        style={fieldStyle}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          update(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) update(event);
        }}
      >
        <i
          style={{
            left: String(saturation) + "%",
            top: String(100 - lightness) + "%",
            background: state.color.hex,
          }}
        />
        <span>COLOR FIELD / DRAG</span>
      </div>

      <aside className="pfx-c-console">
        <div className="pfx-c-color-block" style={{ background: state.color.hex }}>
          <strong>{state.color.hex.toUpperCase()}</strong>
        </div>

        <Slider
          label="H"
          value={hue}
          min={0}
          max={360}
          hue
          onChange={(value) =>
            commitColor(
              "hsl(" +
                value +
                " " +
                round(saturation) +
                "% " +
                round(lightness) +
                "%)",
            )
          }
        />
        <Slider
          label="S"
          value={saturation}
          min={0}
          max={100}
          suffix="%"
          onChange={(value) =>
            commitColor(
              "hsl(" + round(hue) + " " + value + "% " + round(lightness) + "%)",
            )
          }
        />
        <Slider
          label="L"
          value={lightness}
          min={0}
          max={100}
          suffix="%"
          onChange={(value) =>
            commitColor(
              "hsl(" + round(hue) + " " + round(saturation) + "% " + value + "%)",
            )
          }
        />

        <div className="pfx-c-readouts">
          <Readout label="L" value={round(oklch?.coordinates[0], 4)} />
          <Readout label="C" value={round(oklch?.coordinates[1], 4)} />
          <Readout label="H" value={round(oklch?.coordinates[2], 2)} />
          <Readout label="A" value={round(state.color.alpha, 2)} />
        </div>
      </aside>
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

function Slider({
  label,
  value,
  min,
  max,
  suffix = "",
  hue = false,
  step = 0.5,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  hue?: boolean;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="pfx-c-slider">
      <span>{label}</span>
      <input
        className={hue ? "pfx-is-hue" : ""}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{round(value) + suffix}</output>
    </label>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function Palette({
  state,
  workspace,
  sync,
  commitColor,
  openGradient,
}: {
  state: WorkspaceState;
  workspace: PfxColorsWorkspace;
  sync: (next?: WorkspaceState) => void;
  commitColor: (input: ColorInput) => void;
  openGradient: () => void;
}) {
  const [count, setCount] = useState(9);
  const [low, setLow] = useState(10);
  const [high, setHigh] = useState(94);
  const [chroma, setChroma] = useState(100);

  const palette = useMemo(
    () =>
      generateTonalPalette(asInput(state.color.source), {
        count,
        minLightness: low / 100,
        maxLightness: high / 100,
        chromaScale: chroma / 100,
      }),
    [chroma, count, high, low, state.color.source],
  );

  const sendToGradient = () => {
    sync(
      workspace.createGradient(
        palette.colors.map((color) => ({
          color: asInput(color.value),
          position: color.position,
        })),
      ),
    );
    openGradient();
  };

  return (
    <section className="pfx-c-workbench pfx-c-workbench--palette">
      <div className="pfx-c-palette-ribbon">
        {palette.colors.map((color) => (
          <button
            key={color.index}
            type="button"
            style={{ background: color.hex }}
            onClick={() => commitColor(asInput(color.value))}
          >
            <span>{color.hex.toUpperCase()}</span>
            <small>{String(color.index + 1).padStart(2, "0")}</small>
          </button>
        ))}
      </div>

      <div className="pfx-c-panel">
        <div className="pfx-c-panel__heading">
          <div>
            <small>TONAL ENGINE</small>
            <h1>Shape the palette.</h1>
          </div>
          <button type="button" className="pfx-c-action" onClick={sendToGradient}>
            SEND TO GRADIENT →
          </button>
        </div>

        <Slider label="N" value={count} min={3} max={16} step={1} onChange={setCount} />
        <Slider
          label="MIN"
          value={low}
          min={0}
          max={70}
          suffix="%"
          onChange={(value) => setLow(Math.min(value, high - 5))}
        />
        <Slider
          label="MAX"
          value={high}
          min={30}
          max={100}
          suffix="%"
          onChange={(value) => setHigh(Math.max(value, low + 5))}
        />
        <Slider label="CHR" value={chroma} min={0} max={180} suffix="%" onChange={setChroma} />
      </div>
    </section>
  );
}

function Harmony({
  state,
  workspace,
  sync,
  commitColor,
  openGradient,
}: {
  state: WorkspaceState;
  workspace: PfxColorsWorkspace;
  sync: (next?: WorkspaceState) => void;
  commitColor: (input: ColorInput) => void;
  openGradient: () => void;
}) {
  const [scheme, setScheme] = useState<HarmonyScheme>("triadic");
  const harmony = useMemo(
    () => generateHarmony(asInput(state.color.source), scheme),
    [scheme, state.color.source],
  );

  const sendToGradient = () => {
    sync(workspace.generateHarmony(scheme));
    sync(workspace.createGradientFromHarmony({ type: "conic" }));
    openGradient();
  };

  return (
    <section className="pfx-c-workbench pfx-c-workbench--harmony">
      <div className="pfx-c-wheel-zone">
        <div className="pfx-c-wheel">
          <div className="pfx-c-wheel__center">
            <img src="./logo.svg" alt="" />
          </div>
          {harmony.colors.map((color) => {
            const hue = harmony.baseHue + color.hueOffset;
            const radians = ((hue - 90) * Math.PI) / 180;
            const x = 50 + Math.cos(radians) * 40;
            const y = 50 + Math.sin(radians) * 40;
            return (
              <button
                key={color.index}
                type="button"
                className="pfx-c-node"
                style={{
                  left: String(x) + "%",
                  top: String(y) + "%",
                  background: color.hex,
                }}
                onClick={() => commitColor(asInput(color.value))}
              >
                {color.index + 1}
              </button>
            );
          })}
        </div>
      </div>

      <aside className="pfx-c-harmony-list">
        <small>HUE GEOMETRY</small>
        <h1>{scheme.replaceAll("-", " ")}</h1>
        {HARMONY_SCHEMES.map((item) => (
          <button
            key={item}
            type="button"
            className={item === scheme ? "pfx-is-current" : ""}
            onClick={() => setScheme(item)}
          >
            <span>{item.replaceAll("-", " ")}</span>
            <i>{item === "complementary" ? "180°" : item === "triadic" ? "120°" : item === "square" ? "90°" : "VAR"}</i>
          </button>
        ))}
        <button type="button" className="pfx-c-action" onClick={sendToGradient}>
          SEND TO GRADIENT →
        </button>
      </aside>
    </section>
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
  const [hue, setHue] = useState<"shorter" | "longer" | "increasing" | "decreasing">("shorter");

  const fallback = useMemo(() => {
    const harmony = generateHarmony(asInput(state.color.source), "complementary");
    return createGradient(
      [
        { color: asInput(harmony.colors[0].value), position: 0 },
        { color: asInput(harmony.colors[1].value), position: 1 },
      ],
      { type, angle, interpolationSpace: space, hue },
    );
  }, [angle, hue, space, state.color.source, type]);

  const source = state.gradient ?? fallback;
  const gradient = useMemo(
    () =>
      createGradient(
        source.stops.map((stop) => ({
          color: asInput(stop.source),
          position: stop.position,
        })),
        { type, angle, interpolationSpace: space, hue },
      ),
    [angle, hue, source, space, type],
  );

  const css = gradientToCss(gradient);

  const commitStops = (stops: GradientStopInput[]) => {
    sync(workspace.createGradient(stops, { type, angle, interpolationSpace: space, hue }));
  };

  const addStop = () => {
    const sampled = sampleGradient(gradient, 0.5);
    commitStops([
      ...gradient.stops.map((stop) => ({ color: asInput(stop.source), position: stop.position })),
      { color: asInput(sampled), position: 0.5 },
    ]);
  };

  return (
    <section className="pfx-c-workbench pfx-c-workbench--gradient">
      <div className="pfx-c-gradient-zone">
        <button
          type="button"
          className="pfx-c-gradient-preview"
          style={{ background: css }}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const at = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
            commitColor(asInput(sampleGradient(gradient, at)));
          }}
        />

        <div className="pfx-c-stop-line">
          {gradient.stops.map((stop) => (
            <div className="pfx-c-stop" key={stop.index} style={{ left: String(stop.position * 100) + "%" }}>
              <input
                type="color"
                value={stop.hex}
                onChange={(event) =>
                  commitStops(
                    gradient.stops.map((item, index) => ({
                      color: index === stop.index ? event.target.value : asInput(item.source),
                      position: item.position,
                    })),
                  )
                }
              />
              <span>{stop.hex.toUpperCase()}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={stop.position}
                onChange={(event) =>
                  commitStops(
                    gradient.stops.map((item, index) => ({
                      color: asInput(item.source),
                      position: index === stop.index ? Number(event.target.value) : item.position,
                    })),
                  )
                }
              />
              {gradient.stops.length > 2 && (
                <button
                  type="button"
                  className="pfx-c-stop__remove"
                  onClick={() =>
                    commitStops(
                      gradient.stops
                        .filter((_, index) => index !== stop.index)
                        .map((item) => ({
                          color: asInput(item.source),
                          position: item.position,
                        })),
                    )
                  }
                  aria-label={"Remove stop " + String(stop.index + 1)}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <aside className="pfx-c-gradient-controls">
        <div className="pfx-c-segmented">
          {(["linear", "radial", "conic"] as GradientType[]).map((item) => (
            <button key={item} type="button" className={item === type ? "pfx-is-current" : ""} onClick={() => setType(item)}>
              {item}
            </button>
          ))}
        </div>

        <Slider label="ANGLE" value={angle} min={0} max={359} step={1} suffix="°" onChange={setAngle} />

        <label className="pfx-c-select">
          <span>INTERPOLATION</span>
          <select value={space} onChange={(event) => setSpace(event.target.value)}>
            <option value="oklch">OKLCH</option>
            <option value="oklab">OKLAB</option>
            <option value="srgb">sRGB</option>
            <option value="lab">LAB</option>
          </select>
        </label>

        <label className="pfx-c-select">
          <span>HUE PATH</span>
          <select value={hue} onChange={(event) => setHue(event.target.value as typeof hue)}>
            <option value="shorter">SHORTER</option>
            <option value="longer">LONGER</option>
            <option value="increasing">INCREASING</option>
            <option value="decreasing">DECREASING</option>
          </select>
        </label>

        <button type="button" className="pfx-c-action" onClick={addStop}>
          + ADD STOP
        </button>
        <code>{css}</code>
      </aside>
    </section>
  );
}
