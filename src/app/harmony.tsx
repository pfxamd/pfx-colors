import { useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { ColorInput, ColorValue, HarmonyScheme, WorkspaceState, PfxColorsWorkspace } from "@pfx/color-core";
import { HARMONY_SCHEMES } from "@pfx/color-core";
import { generateHarmony, colorEngine } from "../rust/operations";
import { useRadialDrag } from "../interaction/use-radial-drag";
import { useScalarDial } from "../interaction/use-scalar-dial";
import { copyColorText } from "./clipboard";
import { textContrast } from "./tones-model";

const SCHEME_OFFSETS: Record<HarmonyScheme, readonly number[]> = {
  analogous: [-30, 0, 30], complementary: [0, 180],
  "split-complementary": [0, 150, 210], triadic: [0, 120, 240],
  tetradic: [0, 60, 180, 240], square: [0, 90, 180, 270],
};
const LABELS: Record<HarmonyScheme, string> = {
  analogous: "Analogous", complementary: "Complementary",
  "split-complementary": "Split complement", triadic: "Triadic",
  tetradic: "Tetradic", square: "Square",
};
const wrapHue = (hue: number) => ((hue % 360) + 360) % 360;
const input = (value: ColorValue): ColorInput => ({
  space: value.space, coordinates: value.coordinates.map(v => v ?? 0), alpha: value.alpha,
});
const cssTokens = (hexes: readonly string[]) =>
  ":root {\n" + hexes.map((hex, index) =>
    "  --harmony-" + String(index + 1).padStart(2, "0") + ": " + hex.toUpperCase() + ";").join("\n") + "\n}";

type Props = {
  state: WorkspaceState;
  workspace: PfxColorsWorkspace;
  sync: (next?: WorkspaceState) => void;
  commitColor: (input: ColorInput) => void;
  openGradient: () => void;
  saveSet: (name: string, colors: readonly string[]) => void;
  favorites: readonly string[];
  toggleFavorite: (hex: string) => void;
};

function PresetGlyph({ scheme }: { scheme: HarmonyScheme }) {
  return <span className="pfx-c-harmony-preset__glyph" aria-hidden="true">
    <i />
    {SCHEME_OFFSETS[scheme].map((offset, i) => {
      const radians = (offset - 90) * Math.PI / 180;
      return <b key={i} style={{
        left: 50 + Math.cos(radians) * 37 + "%",
        top: 50 + Math.sin(radians) * 37 + "%",
      }} />;
    })}
  </span>;
}

function WheelNode({ wheelRef, index, hue, hex, onRotate, onSelect }: {
  wheelRef: RefObject<HTMLDivElement | null>;
  index: number;
  hue: number;
  hex: string;
  onRotate: (value: number) => void;
  onSelect: () => void;
}) {
  const nodeRef = useRef<HTMLButtonElement>(null);
  const didDrag = useRef(false);
  useRadialDrag(nodeRef, wheelRef, value => {
    didDrag.current = true;
    onRotate(value);
  });
  const radians = (hue - 90) * Math.PI / 180;
  return <button ref={nodeRef} type="button" className="pfx-c-node pfx-harmony__node"
    style={{
      left: 50 + Math.cos(radians) * 40 + "%",
      top: 50 + Math.sin(radians) * 40 + "%",
      backgroundColor: hex,
      color: textContrast(hex).color,
    }}
    onPointerDown={() => { didDrag.current = false; }}
    onClick={() => {
      if (didDrag.current) { didDrag.current = false; return; }
      onSelect();
    }}
    aria-label={"Drag harmony color " + (index + 1)}
    title={"Rotate linked harmony · " + hex.toUpperCase()}>
    {index + 1}
  </button>;
}

function RotationDial({ hue, onChange }: { hue: number; onChange: (value: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useScalarDial(ref, { value: hue, min: 0, max: 359, step: 1, onChange });
  return <div className="pfx-harmony__rotation">
    <div ref={ref} className="pfx-c-harmony-dial" style={{
      "--pfx-dial-angle": hue + "deg",
    } as CSSProperties} role="slider" tabIndex={0} aria-label="Rotate harmony"
      aria-valuemin={0} aria-valuemax={359} aria-valuenow={Math.round(hue)}
      aria-valuetext={Math.round(hue) + " degrees"}>
      <span className="pfx-c-harmony-dial__track" />
      <span className="pfx-c-harmony-dial__needle" />
      <i className="pfx-c-harmony-dial__handle" />
      <div className="pfx-c-harmony-dial__readout"><span>↻</span>
        <strong>{String(Math.round(hue)).padStart(3, "0")}°</strong></div>
    </div>
    <div className="pfx-harmony__rotation-steps">
      <button type="button" aria-label="Rotate harmony counterclockwise"
        onClick={() => onChange(hue - 15)}>−15°</button>
      <output>BASE HUE</output>
      <button type="button" aria-label="Rotate harmony clockwise"
        onClick={() => onChange(hue + 15)}>+15°</button>
    </div>
  </div>;
}

export function Harmony({ state, workspace, sync, commitColor, openGradient,
  saveSet, favorites, toggleFavorite }: Props) {
  // Local seed isolates the generated set from selecting one of its results.
  // Rotation deliberately updates both the seed and shared workspace color.
  const [seed, setSeed] = useState<ColorInput>(() => state.color.hex);
  const [scheme, setScheme] = useState<HarmonyScheme>("triadic");
  const [analogousAngle, setAnalogousAngle] = useState(30);
  const [splitAngle, setSplitAngle] = useState(30);
  const [tetradicAngle, setTetradicAngle] = useState(60);
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState("");
  const [expandedExport, setExpandedExport] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);

  const harmony = useMemo(() => generateHarmony(seed, scheme, {
    analogousAngle, splitAngle, tetradicAngle,
  }), [seed, scheme, analogousAngle, splitAngle, tetradicAngle]);
  const hexes = harmony.colors.map(color => color.hex);
  const chosen = harmony.colors[Math.min(selected, harmony.colors.length - 1)];
  const geometry = scheme === "analogous" ?
    { value: analogousAngle, min: 5, max: 90, step: 5, update: setAnalogousAngle } :
    scheme === "split-complementary" ?
      { value: splitAngle, min: 5, max: 90, step: 5, update: setSplitAngle } :
      scheme === "tetradic" ?
        { value: tetradicAngle, min: 15, max: 165, step: 5, update: setTetradicAngle } : null;
  const fixed = scheme === "complementary" ? 180 : scheme === "triadic" ? 120 : 90;
  const angleValue = geometry?.value ?? fixed;

  const rotate = (rawHue: number) => {
    const original = colorEngine.color.convert(seed, "oklch");
    const next: ColorInput = { space: "oklch",
      coordinates: [original.coordinates[0] ?? 0, original.coordinates[1] ?? 0, wrapHue(rawHue)],
      alpha: original.alpha,
    };
    setSeed(next);
    commitColor(next);
  };
  const rotateByNode = (index: number, absoluteHue: number) =>
    rotate(absoluteHue - (harmony.colors[index]?.hueOffset ?? 0));
  const choose = (index: number) => {
    setSelected(index);
    commitColor(input(harmony.colors[index].value));
  };
  const useCurrent = () => {
    setSeed(state.color.hex);
    setSelected(0);
    setStatus("Base color updated");
  };
  const copy = async (value: string, success: string) =>
    setStatus(await copyColorText(value) ? success : "Clipboard unavailable");
  const reset = () => {
    setAnalogousAngle(30);
    setSplitAngle(30);
    setTetradicAngle(60);
    setStatus("Geometry reset");
  };
  const sendToGradient = () => {
    const count = harmony.colors.length;
    sync(workspace.createGradient(harmony.colors.map((color, i) => ({
      color: input(color.value), position: i / (count - 1),
    })), { type: "conic" }));
    openGradient();
  };

  return <section className="pfx-v2__page pfx-c-workbench--harmony pfx-harmony"
    aria-label="Harmony workstation">
    <div className="pfx-v2__page-heading pfx-harmony__heading">
      <div><span className="pfx-v2__eyebrow">COLOR RELATIONSHIPS</span>
        <h1>Harmony.</h1>
        <p>Build linked color families. Rotate the wheel, adjust geometry, and use every result.</p></div>
      <div className="pfx-harmony__actions">
        <button type="button" onClick={() => void copy(hexes.map(x => x.toUpperCase()).join("\n"),
          "Harmony HEX colors copied")}>Copy all HEX</button>
        <button type="button" onClick={() => {
          saveSet(LABELS[scheme] + " harmony", hexes);
          setStatus("Saved to Collections");
        }}>Save set</button>
        <button className="pfx-harmony__primary pfx-c-harmony-gradient-action" type="button"
          aria-label="Send harmony to gradient" onClick={sendToGradient}>Send to Gradient →</button>
      </div>
    </div>

    <div className="pfx-harmony__presets">
      <div className="pfx-harmony__section-line"><strong>01 / RELATIONSHIP</strong><span>Choose a harmony type</span></div>
      <div className="pfx-c-harmony-presets" aria-label="Harmony schemes">
        {HARMONY_SCHEMES.map(item => <button key={item} type="button"
          className={"pfx-c-harmony-preset" + (scheme === item ? " pfx-is-current" : "")}
          aria-label={item.replaceAll("-", " ")} aria-pressed={scheme === item}
          title={LABELS[item]} onClick={() => { setScheme(item); setSelected(0); }}>
          <PresetGlyph scheme={item}/><strong>{LABELS[item]}</strong>
        </button>)}
      </div>
    </div>

    <div className="pfx-harmony__stage">
      <div className="pfx-harmony__wheel-card">
        <div className="pfx-harmony__section-line"><strong>02 / INTERACTIVE WHEEL</strong>
          <span>Drag a handle to rotate the linked colors</span></div>
        <div className="pfx-c-wheel-zone pfx-harmony__wheel-zone">
          <div className="pfx-c-wheel pfx-harmony__wheel" ref={wheelRef}>
            {harmony.colors.map(color => {
              const hue = wrapHue(harmony.baseHue + color.hueOffset);
              return <span key={"arm-"+color.index} className="pfx-c-harmony-arm"
                style={{ "--pfx-angle": hue + "deg" } as CSSProperties} aria-hidden="true" />;
            })}
            <div className="pfx-c-wheel__center pfx-harmony__wheel-center">
              <span>LINKED</span><strong>{Math.round(harmony.baseHue)}°</strong>
            </div>
            {harmony.colors.map(color => <WheelNode key={color.index}
              wheelRef={wheelRef} index={color.index}
              hue={wrapHue(harmony.baseHue + color.hueOffset)} hex={color.hex}
              onRotate={value => rotateByNode(color.index, value)}
              onSelect={() => choose(color.index)} />)}
          </div>
        </div>
        <div className="pfx-harmony__seed">
          <span className="pfx-harmony__seed-chip" style={{ background: colorEngine.color.formatHex(seed) }}/>
          <div><small>BASE COLOR</small><strong>{colorEngine.color.formatHex(seed).toUpperCase()}</strong></div>
          <button type="button" onClick={useCurrent}>Use current color</button>
        </div>
      </div>

      <aside className="pfx-harmony__inspector" aria-label="Harmony controls">
        <div className="pfx-harmony__section-line"><strong>03 / CONTROL</strong>
          <button type="button" onClick={reset}>Reset geometry</button></div>
        <RotationDial hue={harmony.baseHue} onChange={rotate} />
        <div className="pfx-harmony__spread">
          <div><strong>Color spread</strong><output>{angleValue}°</output></div>
          {geometry ? <input type="range" min={geometry.min} max={geometry.max}
            step={geometry.step} value={geometry.value}
            aria-label="Harmony spread" onChange={e => geometry.update(Number(e.target.value))} />
            : <p>This arrangement has fixed geometric angles.</p>}
        </div>
        {chosen && <div className="pfx-harmony__picked">
          <div><small>SELECTED · {String(chosen.index + 1).padStart(2,"0")}</small>
            <strong>{chosen.hex.toUpperCase()}</strong></div>
          <span style={{background:chosen.hex}} />
          <button type="button" onClick={() => void copy(chosen.hex.toUpperCase(), "Color copied")}>Copy selected</button>
        </div>}
        <div className="pfx-harmony__export">
          <button type="button" aria-expanded={expandedExport}
            onClick={() => setExpandedExport(v => !v)}>Export options {expandedExport ? "−" : "+"}</button>
          {expandedExport && <div>
            <button type="button" onClick={() => void copy(cssTokens(hexes), "CSS variables copied")}>Copy CSS</button>
            <button type="button" onClick={() => void copy(JSON.stringify(hexes, null, 2), "JSON copied")}>Copy JSON</button>
          </div>}
        </div>
      </aside>
    </div>

    <div className="pfx-harmony__result">
      <div className="pfx-harmony__section-line"><strong>04 / HARMONY COLORS</strong>
        <span>Select · Copy · Save individually</span></div>
      <div className="pfx-c-harmony-swatches pfx-harmony__swatches" aria-label="Harmony colors">
        {harmony.colors.map(color => <article key={color.index} className="pfx-harmony__swatch">
          <button type="button" className="pfx-harmony__swatch-surface"
            style={{ background: color.hex, color: textContrast(color.hex).color }}
            aria-label={"Use " + color.hex} onClick={() => choose(color.index)}>
            <span>{String(color.index + 1).padStart(2, "0")}</span>
            <strong>{color.hex.toUpperCase()}</strong>
          </button>
          <div><button type="button" onClick={() =>
            void copy(color.hex.toUpperCase(), "Color copied")}>Copy</button>
            <button type="button" aria-label={
              (favorites.includes(color.hex.toLowerCase()) ? "Remove favorite " : "Save favorite ") + color.hex}
              aria-pressed={favorites.includes(color.hex.toLowerCase())}
              onClick={() => toggleFavorite(color.hex)}>
              {favorites.includes(color.hex.toLowerCase()) ? "★" : "☆"}</button></div>
        </article>)}
      </div>
    </div>
    <p className="pfx-harmony__status" role="status" aria-live="polite">{status}</p>
  </section>;
}
