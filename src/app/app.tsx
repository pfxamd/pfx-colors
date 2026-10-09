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
import { Gradient } from "./gradient";

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
          openPicker={(hex: string) => { commitColor(hex); setActiveTool("picker"); }}
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
        <Gradient state={state} workspace={workspace} sync={sync} commitColor={commitColor}
          saveSet={library.saveSet} />
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
