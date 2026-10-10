import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ColorInput, WorkspaceState } from "@pfx/color-core";
import { useColorFieldControl } from "../interaction/use-color-field-control";
import { useHorizontalTrackDrag } from "../interaction/use-horizontal-track-drag";
import { copyColorText } from "./clipboard";
import { textContrast } from "./tones-model";
import { alphaHex, clampChannel, cssHsl, cssOklch, cssRgb, paintHslField, rgbFromHex } from "./picker-model";

type Props = {
  state: WorkspaceState;
  commitColor: (input: ColorInput) => void;
  openTones: (hex: string) => void;
  favorite: boolean;
  toggleFavorite: (hex: string) => void;
};

function NumericChannel({
  label, value, min, max, step = 1, onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(String(value)); }, [value, focused]);
  const apply = () => {
    const parsed = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(parsed)) {
      const valid = clampChannel(parsed, min, max);
      if (Math.abs(valid - value) > 0.00001) onCommit(valid);
      setDraft(String(valid));
    } else setDraft(String(value));
    setFocused(false);
  };
  return (
    <label className="pfx-picker__numeric">
      <span>{label}</span>
      <input type="number" min={min} max={max} step={step}
        aria-label={label + " channel"} value={draft}
        onFocus={() => setFocused(true)}
        onChange={event => setDraft(event.target.value)}
        onBlur={apply}
        onKeyDown={event => {
          if (event.key === "Enter") { event.currentTarget.blur(); }
          if (event.key === "Escape") { setDraft(String(value)); event.currentTarget.blur(); }
        }} />
    </label>
  );
}

function HueRail({ value, update }: { value: number; update: (value: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useHorizontalTrackDrag(ref, ref, {
    value: value / 360, min: 0, max: 1, step: 1 / 360,
    onChange: next => update(next * 360),
  });
  return (
    <div className="pfx-picker__hue-row">
      <label>HUE <strong>{Math.round(value)}°</strong></label>
      <div ref={ref} className="pfx-c-picker-hue pfx-picker__hue"
        role="slider" tabIndex={0} aria-label="Hue"
        aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(value)}>
        <span className="pfx-c-picker-hue__handle" style={{
          left: value / 360 * 100 + "%",
          background: "hsl(" + Math.round(value) + " 100% 50%)",
        }} />
      </div>
    </div>
  );
}

export function Picker({ state, commitColor, openTones, favorite, toggleFavorite }: Props) {
  const hsl = state.color.values.hsl?.coordinates;
  const oklch = state.color.values.oklch?.coordinates;
  const alpha = Number(state.color.alpha ?? 1);
  const hue = Number(hsl?.[0] ?? 0);
  const saturation = Number(hsl?.[1] ?? 0);
  const lightness = Number(hsl?.[2] ?? 0);
  // Inspect the selected sRGB color consistently with the displayed HEX.
  const rgb = rgbFromHex(state.color.hex.slice(0, 7));
  const fieldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [format, setFormat] = useState<"rgb" | "hsl">("hsl");
  const [mobilePanel, setMobilePanel] = useState<"field" | "values">("field");

  const setHsl = (h: number, s: number, l: number, a = alpha) =>
    commitColor(cssHsl(h, s, l, a));
  const setRgb = (index: number, value: number) =>
    commitColor(cssRgb(rgb.map((channel, i) => index === i ? value : channel), alpha));
  const copy = async (value: string, label: string) =>
    setCopyStatus(await copyColorText(value) ? label + " copied" : "Clipboard unavailable");

  useColorFieldControl(fieldRef, {
    value: { x: saturation / 100, y: 1 - lightness / 100 },
    onChange({ x, y }) { setHsl(hue, x * 100, (1 - y) * 100); },
    onActiveChange: setActive,
  });

  // HSL visual field is a real pixel-accurate hue/saturation/lightness plane,
  // not a decorative approximation. It only redraws when hue changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx) paintHslField(ctx, Math.round(hue));
  }, [Math.round(hue)]);

  const hex = alphaHex(state.color.hex.slice(0, 7), alpha);
  const formats = {
    hex,
    rgb: cssRgb(rgb, alpha),
    hsl: cssHsl(hue, saturation, lightness, alpha),
    oklch: cssOklch(Number(oklch?.[0] ?? 0), Number(oklch?.[1] ?? 0), Number(oklch?.[2] ?? 0), alpha),
  };
  const readable = textContrast(state.color.hex);
  const fieldStyle = { "--pfx-hue": String(hue) } as CSSProperties;
  const accentInput = { "--pfx-picked-color": state.color.hex } as CSSProperties;

  return (
    <section className="pfx-c-workbench--picker pfx-picker pfx-v2__page" aria-label="Color picker workstation">
      <div className="pfx-v2__page-heading pfx-picker__heading">
        <h1>Picker</h1>
        <div className="pfx-picker__top-actions">
          <button type="button" aria-pressed={favorite}
            onClick={() => toggleFavorite(state.color.hex)}>
            {favorite ? "★ Saved" : "☆ Save color"}
          </button>
          <button type="button" className="pfx-picker__primary"
            onClick={() => openTones(state.color.hex)}>Create Tones →</button>
        </div>
      </div>
      <div className="pfx-picker__views" role="group" aria-label="Picker panels">
        <button type="button" aria-pressed={mobilePanel === "field"} onClick={() => setMobilePanel("field")}>Color field</button>
        <button type="button" aria-pressed={mobilePanel === "values"} onClick={() => setMobilePanel("values")}>Values &amp; channels</button>
      </div>
      <div className="pfx-picker__layout" data-panel={mobilePanel}>
        <div className="pfx-picker__canvas-card">
          <div className="pfx-picker__card-caption"><strong>Color field</strong><span>Drag · Arrow keys for precision</span></div>
          <div className="pfx-c-picker-main pfx-picker__surface">
            <div ref={fieldRef} className={"pfx-c-color-field pfx-picker__field" + (active ? " pfx-is-active" : "")}
              style={fieldStyle} tabIndex={0} role="slider"
              aria-label="Color field. Use pointer or arrow keys. Hold Shift for precision."
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(saturation)}
              aria-valuetext={"Saturation " + Math.round(saturation) + "%, Lightness " + Math.round(lightness) + "%"}>
              <canvas ref={canvasRef} width={256} height={160} aria-hidden="true" className="pfx-picker__plane" />
              <div className={"pfx-c-color-cursor" + (saturation > 82 ? " pfx-is-right-edge" : "")
                + (saturation < 18 ? " pfx-is-left-edge" : "") + (lightness > 82 ? " pfx-is-top-edge" : "")}
                style={{ left: saturation + "%", top: 100 - lightness + "%", ...accentInput }}>
                <span className="pfx-c-color-cursor__swatch" />
                <span className="pfx-c-color-cursor__crosshair" />
                <output className="pfx-c-color-cursor__readout"><strong>{state.color.hex.toUpperCase()}</strong>
                  <small>S {Math.round(saturation)} · L {Math.round(lightness)}</small></output>
              </div>
            </div>
            <div className="pfx-picker__hue-panel"><HueRail value={hue} update={next => setHsl(next, saturation, lightness)} /></div>
          </div>
        </div>
        <aside className="pfx-picker__inspector" aria-label="Color inspector">
          <div className="pfx-picker__preview">
            <div className="pfx-picker__preview-checker" aria-hidden="true">
              <span className="pfx-picker__preview-chip"
                style={{ backgroundColor: state.color.hex, opacity: alpha }} />
            </div>
            <div className="pfx-picker__preview-label">
              <span>Selected color</span>
              <strong>{hex}</strong>
              <small>{state.color.gamut.srgb ? "sRGB ✓" : "Outside sRGB"} · {state.color.gamut.p3 ? "P3 ✓" : "Outside P3"}</small>
            </div>
          </div>
          <div className="pfx-picker__copies">
            {(["hex", "rgb", "hsl", "oklch"] as const).map(key => (
              <div className="pfx-picker__copy-row" key={key}>
                <span>{key.toUpperCase()}</span><code title={formats[key]}>{formats[key]}</code>
                <button type="button" aria-label={"Copy " + key.toUpperCase()}
                  onClick={() => void copy(formats[key], key.toUpperCase())}>Copy</button>
              </div>
            ))}
          </div>
          <details className="pfx-picker__advanced">
            <summary>Channels</summary>
            <div className="pfx-picker__edit">
            <div className="pfx-picker__edit-head"><strong>Channel editor</strong>
              <div role="group" aria-label="Channel mode">
                <button type="button" aria-pressed={format === "hsl"} onClick={() => setFormat("hsl")}>HSL</button>
                <button type="button" aria-pressed={format === "rgb"} onClick={() => setFormat("rgb")}>RGB</button>
              </div>
            </div>
            <div className="pfx-picker__numerics">
              {format === "hsl" ? <>
                <NumericChannel label="Hue" value={Math.round(hue)} min={0} max={360}
                  onCommit={v => setHsl(v, saturation, lightness)} />
                <NumericChannel label="Saturation" value={Math.round(saturation)} min={0} max={100}
                  onCommit={v => setHsl(hue, v, lightness)} />
                <NumericChannel label="Lightness" value={Math.round(lightness)} min={0} max={100}
                  onCommit={v => setHsl(hue, saturation, v)} />
              </> : <>
                {(["Red", "Green", "Blue"] as const).map((label, i) =>
                  <NumericChannel key={label} label={label} value={rgb[i]} min={0} max={255}
                    onCommit={v => setRgb(i, v)} />)}
              </>}
            </div>
            <label className="pfx-picker__alpha"><span>Opacity <strong>{Math.round(alpha * 100)}%</strong></span>
              <input type="range" min={0} max={100} step={1}
                aria-label="Opacity" value={Math.round(alpha * 100)}
                onChange={event => setHsl(hue, saturation, lightness, Number(event.target.value) / 100)} /></label>
          </div>
          </details>
          <p className="pfx-picker__status" role="status" aria-live="polite">{copyStatus}</p>
        </aside>
      </div>
    </section>
  );
}
