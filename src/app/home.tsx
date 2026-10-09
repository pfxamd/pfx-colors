import { useMemo, useState } from "react";
import type { ColorInput, WorkspaceState } from "@pfx/color-core";
import { colorEngine, generateColorStudy, generateHarmony, generateTonalPalette } from "../rust/operations";
import { copyColorText } from "./clipboard";
import { hexStats } from "./explore-model";
import { textContrast } from "./tones-model";
import { useStoredState, isHex, numberBetween } from "./workspace-state";
import type { ToolId } from "./workspace-shell";

type Control = "lightness" | "chroma" | "hueRange" | "toneRange";
type Controls = Record<Control, number>;
const INITIAL: Controls = { lightness: 58, chroma: 58, hueRange: 58, toneRange: 58 };
const CONTROL_LABELS: { id: Control; title: string; hint: string }[] = [
  { id: "lightness", title: "Lightness", hint: "Dark to light" },
  { id: "chroma", title: "Chroma", hint: "Muted to vivid" },
  { id: "hueRange", title: "Hue range", hint: "Tight to wide" },
  { id: "toneRange", title: "Tone range", hint: "Subtle to broad" },
];
function isControls(value: unknown): value is Controls {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<Controls>;
  return CONTROL_LABELS.every(({ id }) =>
    typeof record[id] === "number" && Number.isInteger(record[id]) &&
    (record[id] as number) >= 0 && (record[id] as number) <= 100);
}
function randomSequence(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    current += 0x6d2b79f5;
    let n = current;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
type Props = {
  state: WorkspaceState;
  commitColor: (input: ColorInput) => void;
  navigate: (tool: ToolId) => void;
  favorites: readonly string[];
  recent: readonly string[];
  toggleFavorite: (hex: string) => void;
};
export function Home({ state, commitColor, navigate, favorites, recent, toggleFavorite }: Props) {
  const hex = state.color.hex.toLowerCase();
  const [controls, setControls] = useStoredState("pfx-colors.home.controls.v2", INITIAL, isControls);
  const [seed, setSeed] = useStoredState("pfx-colors.home.seed.v2", hex, isHex);
  const [randomSeed, setRandomSeed] = useStoredState("pfx-colors.home.random.v2", 64521, numberBetween(0, 2147483647));
  const [generation, setGeneration] = useStoredState("pfx-colors.home.generation.v2", 1, numberBetween(1, 1000000));
  const [selected, setSelected] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const stats = useMemo(() => hexStats(hex), [hex]);
  const readable = textContrast(hex);
  const isFavorite = favorites.includes(hex);
  const study = useMemo(() => generateColorStudy(seed, { ...controls, random: randomSequence(randomSeed) }),
    [controls, randomSeed, seed]);
  const tones = useMemo(() => generateTonalPalette(hex, {
    count: 5, minLightness: 0.14, maxLightness: 0.94, chromaScale: 1,
  }).colors, [hex]);
  const complement = useMemo(() => generateHarmony(hex, "complementary").colors, [hex]);
  const copy = async (value: string) => {
    setNotice(await copyColorText(value.toUpperCase()) ? "Color copied" : "Clipboard unavailable");
  };
  const regenerate = () => {
    setSeed(hex);
    setRandomSeed(Math.floor(Math.random() * 2147483647));
    setGeneration(value => value >= 1000000 ? 1 : value + 1);
    setSelected(null);
    setNotice("Fresh color study generated");
  };
  const pick = (value: string, index?: number) => {
    commitColor(value);
    setSelected(index ?? null);
  };
  return (
    <section className="pfx-home pfx-v2__page" aria-label="Home color workspace">
      <div className="pfx-home__intro">
        <div>
          <span className="pfx-v2__eyebrow">PFx COLORS / WORKSPACE</span>
          <h1>Your color workspace.</h1>
          <p>Choose a direction, explore your current color, or build a new palette.</p>
        </div>
        <button type="button" className="pfx-home__browse" onClick={() => navigate("explore")}>
          Explore colors <span aria-hidden="true">↗</span>
        </button>
      </div>

      <div className="pfx-home__top">
        <article className="pfx-home__active">
          <div className="pfx-home__card-heading"><span>01 / ACTIVE COLOR</span>
            <span>{stats.family.toUpperCase()} · sRGB</span></div>
          <div className="pfx-home__color-area" style={{ backgroundColor: hex, color: readable.color }}>
            <span>YOUR CURRENT SHADE</span>
            <strong>{hex.toUpperCase()}</strong>
            <div className="pfx-home__sample">
              <span>Color in focus.</span><small>Previewed against its own surface</small>
            </div>
          </div>
          <div className="pfx-home__color-footer">
            <div><small>HUE</small><strong>{Math.round(stats.hue)}°</strong></div>
            <div><small>SATURATION</small><strong>{Math.round(stats.saturation)}%</strong></div>
            <div><small>LIGHTNESS</small><strong>{Math.round(stats.lightness)}%</strong></div>
            <div className="pfx-home__color-actions">
              <button type="button" onClick={() => void copy(hex)}>Copy HEX</button>
              <button type="button" aria-pressed={isFavorite} onClick={() => toggleFavorite(hex)}>
                {isFavorite ? "★ Saved" : "☆ Save"}</button>
            </div>
          </div>
        </article>
        <div className="pfx-home__routes" aria-label="Workspace shortcuts">
          <div className="pfx-home__routes-head">
            <span>02 / OPEN A TOOL</span><small>Continue with the current color</small>
          </div>
          {([
            ["picker", "Picker", "Fine-tune your color", "01"],
            ["tones", "Tones", "Explore light and dark", "02"],
            ["harmony", "Harmony", "Find related colors", "03"],
            ["gradient", "Gradient", "Blend and compose", "04"],
          ] as const).map(([id, label, detail, n]) => (
            <button className="pfx-home__route" type="button" key={id} onClick={() => navigate(id)}>
              <span className="pfx-home__route-index">{n}</span>
              <span><strong>{label}</strong><small>{detail}</small></span>
              <span aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pfx-home__lower">
        <article className="pfx-home__study">
          <div className="pfx-home__section-heading">
            <div><span className="pfx-v2__eyebrow">03 / COLOR STUDY</span>
              <h2>Discover a new combination.</h2>
              <p>Generate variations and adjust the character of the entire study.</p></div>
            <button type="button" className="pfx-home__generate" onClick={regenerate}>
              Generate new <span aria-hidden="true">↗</span>
            </button>
          </div>
          <div className="pfx-home__study-swatches" aria-label="Generated color study">
            {study.colors.map((color, index) => (
              <button type="button" key={color.index} className={selected === index ? "pfx-is-selected" : ""}
                style={{ backgroundColor: color.hex, color: textContrast(color.hex).color }}
                aria-pressed={selected === index}
                aria-label={"Use generated color " + color.hex}
                onClick={() => { commitColor(color.hex); setSelected(index); }}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{color.hex.toUpperCase()}</strong>
              </button>
            ))}
          </div>
          <div className="pfx-home__study-bar">
            <span>STUDY {String(generation).padStart(2, "0")} · BASE {seed.toUpperCase()}</span>
            <button type="button" onClick={() => { setSeed(hex); setSelected(null); }}>
              Use current as base</button>
          </div>
          <div className="pfx-home__controls">
            {CONTROL_LABELS.map(control => (
              <label key={control.id} className="pfx-home__control">
                <span><strong>{control.title}</strong><small>{control.hint}</small><output>{controls[control.id]}</output></span>
                <input type="range" min="0" max="100" step="1" value={controls[control.id]}
                  aria-label={"Study " + control.title}
                  onChange={event => setControls(previous => ({
                    ...previous, [control.id]: Number(event.target.value),
                  }))} />
              </label>
            ))}
          </div>
        </article>

        <div className="pfx-home__extras">
          <article className="pfx-home__extra-card">
            <div className="pfx-home__extra-head"><span>04 / TONAL PREVIEW</span>
              <button type="button" onClick={() => navigate("tones")}>Open Tones ↗</button></div>
            <div className="pfx-home__tone-strip" aria-label="Current color tones">
              {tones.map((tone, index) => <button type="button" key={index}
                style={{ backgroundColor: tone.hex }} title={tone.hex.toUpperCase()}
                aria-label={"Use tone " + tone.hex}
                onClick={() => pick(tone.hex)} />)}
            </div>
            <div className="pfx-home__extra-meta"><span>Dark</span><span>Light</span></div>
          </article>
          <article className="pfx-home__extra-card">
            <div className="pfx-home__extra-head"><span>05 / COMPLEMENTARY PAIR</span>
              <button type="button" onClick={() => navigate("harmony")}>Open Harmony ↗</button></div>
            <div className="pfx-home__complement" aria-label="Complementary colors">
              {complement.map((color, index) => <button type="button" key={index}
                style={{ backgroundColor: color.hex, color: textContrast(color.hex).color }}
                aria-label={"Use complementary color " + color.hex}
                onClick={() => pick(color.hex)}>{color.hex.toUpperCase()}</button>)}
            </div>
          </article>
          <article className="pfx-home__extra-card">
            <div className="pfx-home__extra-head"><span>06 / RECENTLY USED</span>
              <button type="button" onClick={() => navigate("collections")}>Collections ↗</button></div>
            {recent.length ? <div className="pfx-home__recent" aria-label="Recent colors">
              {recent.slice(0, 6).map(color => <button type="button" key={color}
                title={color.toUpperCase()} aria-label={"Use recent color " + color}
                style={{ backgroundColor: color }} onClick={() => pick(color)} />)}
            </div> : <p className="pfx-home__empty">Your recently used colors appear here.</p>}
          </article>
        </div>
      </div>
      <p className="pfx-home__notice" role="status" aria-live="polite">{notice}</p>
    </section>
  );
}
