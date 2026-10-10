import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ColorInput, WorkspaceState, PfxColorsWorkspace } from "@pfx/color-core";
import { useColorFieldControl } from "../interaction/use-color-field-control";
import { useHorizontalTrackDrag } from "../interaction/use-horizontal-track-drag";
import { copyColorText } from "./clipboard";
import { Tones } from "./tones";
import { alphaHex, clampChannel, cssHsl, cssOklch, cssRgb, paintHslField, rgbFromHex } from "./picker-model";

type Props = {
  state: WorkspaceState;
  workspace: PfxColorsWorkspace;
  sync: (next?: WorkspaceState) => void;
  commitColor: (input: ColorInput) => void;
  openGradient: () => void;
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

type RailKind = "opacity" | "saturation" | "lightness";

function ColorRail({ kind, value, hue, saturation, lightness, rgb, onChange }: {
  kind: RailKind;
  value: number;
  hue: number;
  saturation: number;
  lightness: number;
  rgb: readonly number[];
  onChange: (next: number) => void;
}) {
  const label = kind === "opacity" ? "Opacity" :
    kind === "saturation" ? "Saturation" : "Lightness";
  const currentRgb = `rgb(${rgb.join(" ")})`;
  const gradient = kind === "opacity"
    ? `linear-gradient(to right, rgb(${rgb.join(" ")} / 0), ${currentRgb})`
    : kind === "saturation"
      ? `linear-gradient(to right, hsl(${hue} 0% ${lightness}%), hsl(${hue} 100% ${lightness}%))`
      : `linear-gradient(to right, hsl(${hue} ${saturation}% 0%), hsl(${hue} ${saturation}% 50%) 50%, hsl(${hue} ${saturation}% 100%))`;
  const thumb = kind === "opacity"
    ? `rgb(${rgb.join(" ")} / ${value / 100})`
    : kind === "saturation"
      ? `hsl(${hue} ${value}% ${lightness}%)`
      : `hsl(${hue} ${saturation}% ${value}%)`;
  const railStyle = {
    "--pfx-rail-gradient": gradient,
    "--pfx-rail-thumb": thumb,
    "--pfx-rail-checker": kind === "opacity"
      ? "conic-gradient(#b7bfca 25%, #f7f8fa 0 50%, #b7bfca 0 75%, #f7f8fa 0)"
      : "linear-gradient(transparent, transparent)",
  } as CSSProperties;

  return <label className={`pfx-picker__rail pfx-picker__rail--${kind}`} style={railStyle}>
    <span>{label}<strong>{Math.round(value)}%</strong></span>
    <input type="range" min={0} max={100} step={1} value={Math.round(value)}
      aria-label={label} onChange={event => onChange(Number(event.target.value))} />
  </label>;
}

export function Picker({ state, workspace, sync, commitColor, openGradient, favorite, toggleFavorite }: Props) {
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
  const [format, setFormat] = useState<"hex" | "rgb" | "hsl" | "oklch">("hex");
  const [draft, setDraft] = useState(state.color.hex.toUpperCase());
  const [editing, setEditing] = useState(false);
  const [valueError, setValueError] = useState("");
  const ignoreBlur = useRef(false);

  const setHsl = (h: number, s: number, l: number, a = alpha) =>
    commitColor(cssHsl(h, s, l, a));
  const setRgb = (index: number, value: number) =>
    commitColor(cssRgb(rgb.map((channel, i) => index === i ? value : channel), alpha));


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
  const shownValue = formats[format];
  useEffect(() => { if (!editing) setDraft(shownValue); }, [shownValue, editing]);
  const setOklch = (l: number, c: number, h: number) =>
    commitColor(cssOklch(l, c, h, alpha));
  const switchFormat = (next: "hex" | "rgb" | "hsl" | "oklch") => {
    setEditing(false);
    setValueError("");
    setFormat(next);
    setDraft(formats[next]);
  };
  const restoreDraft = () => {
    setDraft(formats[format]);
    setEditing(false);
    setValueError("");
  };
  const applyDraft = () => {
    const candidate = draft.trim();
    const valid = format === "hex"
      ? /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(candidate)
      : candidate.toLowerCase().startsWith(format + "(") && candidate.endsWith(")");
    if (!valid) { setValueError("Invalid " + format.toUpperCase() + " color"); return false; }
    try {
      commitColor(candidate);
      setEditing(false);
      setValueError("");
      return true;
    } catch {
      setValueError("Color could not be applied");
      return false;
    }
  };
  const copySelected = async () =>
    setCopyStatus(await copyColorText(shownValue) ? format.toUpperCase() + " copied" : "Clipboard unavailable");

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
        </div>
      </div>
      <div className="pfx-picker__layout">
        <div className="pfx-picker__canvas-card">
          <div className="pfx-picker__card-caption">
            <span className="pfx-picker__swatch" style={{ backgroundColor: state.color.hex, opacity: alpha }}
              title={state.color.gamut.srgb ? "sRGB color" : "Outside sRGB"} aria-hidden="true" />
            <input className="pfx-picker__value-input" type="text" spellCheck={false} autoComplete="off"
              aria-label="Selected color value" aria-invalid={Boolean(valueError)}
              value={draft} onFocus={() => { setEditing(true); setValueError(""); }}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (applyDraft()) { ignoreBlur.current = true; event.currentTarget.blur(); }
                }
                if (event.key === "Escape") {
                  ignoreBlur.current = true;
                  restoreDraft();
                  event.currentTarget.blur();
                }
              }}
              onBlur={() => {
                if (ignoreBlur.current) { ignoreBlur.current = false; return; }
                if (editing && !applyDraft()) restoreDraft();
              }}
              style={{ width: format === "hex" ? 112 : format === "oklch" ? 230 : 192 }} />
            <select className="pfx-picker__format" aria-label="Color format" value={format}
              onChange={event => switchFormat(event.target.value as typeof format)}>
              <option value="hex">HEX</option>
              <option value="rgb">RGB</option>
              <option value="hsl">HSL</option>
              <option value="oklch">OKLCH</option>
            </select>
            <button className="pfx-picker__copy" type="button" onClick={() => void copySelected()}
              aria-label={"Copy " + format.toUpperCase()} title="Copy current format">Copy</button>
          </div>
          {valueError && <p className="pfx-picker__error" role="alert">{valueError}</p>}
          <div className="pfx-c-picker-main pfx-picker__surface">
            <div ref={fieldRef} className={"pfx-c-color-field pfx-picker__field" + (active ? " pfx-is-active" : "")}
              style={fieldStyle} tabIndex={0} role="slider"
              aria-label="Color field. Use pointer or arrow keys. Hold Shift for precision."
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(saturation)}
              aria-valuetext={"Saturation " + Math.round(saturation) + "%, Lightness " + Math.round(lightness) + "%"}>
              <canvas ref={canvasRef} width={256} height={160} aria-hidden="true" className="pfx-picker__plane" />
              <div className="pfx-picker__precision-cursor" aria-hidden="true"
                style={{ left: saturation + "%", top: 100 - lightness + "%", ...accentInput }} />
            </div>
            <div className="pfx-picker__hue-panel">
              <HueRail value={hue} update={next => setHsl(next, saturation, lightness)} />
              <ColorRail kind="opacity" value={alpha * 100} hue={hue}
                saturation={saturation} lightness={lightness} rgb={rgb}
                onChange={value => setHsl(hue, saturation, lightness, value / 100)} />
            </div>
          </div>
          <details className="pfx-picker__advanced" open>
            <summary>Channels</summary>
            <div className="pfx-picker__edit">
              <ColorRail kind="saturation" value={saturation} hue={hue}
                saturation={saturation} lightness={lightness} rgb={rgb}
                onChange={value => setHsl(hue, value, lightness)} />
              <ColorRail kind="lightness" value={lightness} hue={hue}
                saturation={saturation} lightness={lightness} rgb={rgb}
                onChange={value => setHsl(hue, saturation, value)} />
              {format === "rgb" && <div className="pfx-picker__numerics">
                {(["Red", "Green", "Blue"] as const).map((label, i) =>
                  <NumericChannel key={label} label={label} value={rgb[i]} min={0} max={255}
                    onCommit={v => setRgb(i, v)} />)}
              </div>}
              {format === "hsl" && <div className="pfx-picker__numerics">
                <NumericChannel label="Hue" value={Math.round(hue)} min={0} max={360}
                  onCommit={v => setHsl(v, saturation, lightness)} />
                <NumericChannel label="Saturation" value={Math.round(saturation)} min={0} max={100}
                  onCommit={v => setHsl(hue, v, lightness)} />
                <NumericChannel label="Lightness" value={Math.round(lightness)} min={0} max={100}
                  onCommit={v => setHsl(hue, saturation, v)} />
              </div>}
              {format === "oklch" && <div className="pfx-picker__numerics">
                <NumericChannel label="Oklch Lightness" value={Number(oklch?.[0] ?? 0)}
                  min={0} max={1} step={0.001}
                  onCommit={v => setOklch(v, Number(oklch?.[1] ?? 0), Number(oklch?.[2] ?? 0))} />
                <NumericChannel label="Chroma" value={Number(oklch?.[1] ?? 0)}
                  min={0} max={0.6} step={0.001}
                  onCommit={v => setOklch(Number(oklch?.[0] ?? 0), v, Number(oklch?.[2] ?? 0))} />
                <NumericChannel label="Oklch Hue" value={Number(oklch?.[2] ?? 0)}
                  min={0} max={360} step={0.1}
                  onCommit={v => setOklch(Number(oklch?.[0] ?? 0), Number(oklch?.[1] ?? 0), v)} />
              </div>}
            </div>
          </details>
          <p className="pfx-picker__status" role="status" aria-live="polite">{copyStatus}</p>
        </div>
        <Tones state={state} workspace={workspace} sync={sync}
          commitColor={commitColor} openGradient={openGradient} />
      </div>
    </section>
  );
}
