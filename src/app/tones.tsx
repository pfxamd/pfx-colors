import { useEffect, useMemo, useState } from "react";
import type { ColorInput, WorkspaceState, PfxColorsWorkspace } from "@pfx/color-core";
import { normalizeHex } from "./color-library";
import { copyColorText } from "./clipboard";
import { useStoredState, isHex, numberBetween } from "./workspace-state";
import {
  baseToneLightness, buildTones, DEFAULT_TONES, loadToneConfig, textContrast,
  tonesCss, tonesJson, TONES_SETTINGS_KEY,
  type ToneConfig, type ToneOverrides, type ToneDistribution,
} from "./tones-model";

function isOverrides(value: unknown): value is ToneOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([index, item]) => {
    if (!/^[0-9]{1,2}$/.test(index) || Number(index) > 15 ||
        !item || typeof item !== "object") return false;
    const data = item as { lightness?: unknown; chroma?: unknown };
    return typeof data.lightness === "number" && Number.isFinite(data.lightness) &&
      data.lightness >= 0 && data.lightness <= 100 &&
      typeof data.chroma === "number" && Number.isFinite(data.chroma) &&
      data.chroma >= 0 && data.chroma <= 180;
  });
}
type Props = {
  state: WorkspaceState;
  workspace: PfxColorsWorkspace;
  sync: (next?: WorkspaceState) => void;
  commitColor: (value: ColorInput) => void;
  openGradient: () => void;
};

function saveFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function Tones({ state, workspace, sync, commitColor, openGradient }: Props) {
  // Keep the seed independent of selected swatches: selecting a tone must
  // not unexpectedly regenerate the entire tonal family.
  const [seed, setSeed] = useStoredState("pfx-colors.tones.seed.v2", state.color.hex, isHex);
  const [settings, setSettings] = useState<ToneConfig>(() =>
    loadToneConfig(typeof window === "undefined" ? null : window.localStorage));
  const [overrides, setOverrides] = useStoredState<ToneOverrides>(
    "pfx-colors.tones.overrides.v2", {}, isOverrides);
  const [selected, setSelected] = useStoredState("pfx-colors.tones.selected.v2", 0,
    (value: unknown): value is number => Number.isInteger(value) && numberBetween(0, 15)(value));
  const [status, setStatus] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  // The active Picker color is always the seed; selecting a swatch only previews it.
  // The persisted seed prevents stale manual overrides when returning to Picker.
  useEffect(() => {
    const normalized = normalizeHex(state.color.hex);
    if (!normalized || normalized.toLowerCase() === seed.toLowerCase()) return;
    setSeed(normalized);
    setOverrides({});
    setSelected(0);
    if (settings.lockBase) {
      const lightness = baseToneLightness(normalized);
      setSettings(previous => ({
        ...previous, min: Math.min(previous.min, Math.floor(lightness)),
        max: Math.max(previous.max, Math.ceil(lightness)),
      }));
    }
  }, [state.color.hex, seed, setSeed, setOverrides, setSelected, settings.lockBase]);
  const seedLightness = useMemo(() => baseToneLightness(seed), [seed]);
  const tones = useMemo(() => buildTones(seed, settings, overrides), [seed, settings, overrides]);
  const selectedTone = tones[Math.min(selected, tones.length - 1)] ?? tones[0];
  const foreground = selectedTone ? textContrast(selectedTone.hex) : { color: "#111827", ratio: 1 };

  useEffect(() => {
    try { localStorage.setItem(TONES_SETTINGS_KEY, JSON.stringify(settings)); }
    catch { /* private browsing */ }
  }, [settings]);
  useEffect(() => {
    setSelected(index => Math.min(index, settings.count - 1));
    setOverrides(previous => Object.fromEntries(
      Object.entries(previous).filter(([index]) => Number(index) < settings.count)));
  }, [settings.count]);

  const updateSettings = (change: Partial<ToneConfig>) => {
    setSettings(previous => ({ ...previous, ...change }));
    setOverrides({});
  };

  const setLock = (lockBase: boolean) => {
    if (!lockBase) { updateSettings({ lockBase: false }); return; }
    updateSettings({
      lockBase: true,
      min: Math.min(settings.min, Math.floor(seedLightness)),
      max: Math.max(settings.max, Math.ceil(seedLightness)),
    });
  };

  const selectTone = (index: number) => {
    setSelected(index);
    setStatus("Tone " + String(index + 1).padStart(2, "0") + " preview");
  };

  const copy = async (value: string, message: string) => {
    setStatus(await copyColorText(value) ? message : "Clipboard unavailable. Please check permissions.");
  };

  const adjustSelected = (value: Partial<{ lightness: number; chroma: number }>) => {
    if (selectedTone.locked) return;
    const previous = overrides[selectedTone.index] ?? {
      lightness: selectedTone.lightness, chroma: selectedTone.chroma,
    };
    setOverrides(current => ({ ...current, [selectedTone.index]: { ...previous, ...value } }));
  };

  const clearEdit = () => setOverrides(previous => {
    const next = { ...previous };
    delete next[selectedTone.index];
    return next;
  });

  const sendToGradient = () => {
    sync(workspace.createGradient(tones.map(tone => ({
      color: tone.source, position: tone.position,
    }))));
    openGradient();
  };

  const css = useMemo(() => tonesCss(tones), [tones]);
  const json = useMemo(() => tonesJson(tones), [tones]);

  return (
    <section className="pfx-c-tones pfx-tones-embedded" aria-label="Tone scale builder">
      <header className="pfx-c-tones__heading">
        <strong>Tones</strong>
        <span>{settings.count} shades</span>
        <div className="pfx-c-tones__header-actions">
          <button type="button" onClick={() => void copy(tones.map(t => t.hex.toUpperCase()).join("\n"), "All HEX colors copied")}>Copy all</button>
          <button type="button" onClick={() => setExportOpen(value => !value)}
            aria-expanded={exportOpen}>Export</button>
          <button type="button" className="pfx-c-tones__primary" onClick={sendToGradient}>Gradient →</button>
        </div>
      </header>
      {exportOpen && (
        <div className="pfx-c-tones__export" aria-label="Export tones">
          <button type="button" onClick={() => void copy(css, "CSS variables copied")}>Copy CSS</button>
          <button type="button" onClick={() => saveFile("pfx-tones.css", css, "text/css;charset=utf-8")}>Download CSS</button>
          <button type="button" onClick={() => saveFile("pfx-tones.json", json, "application/json;charset=utf-8")}>Download JSON</button>
        </div>
      )}
      <div className="pfx-c-tones__seedbar">
        <span className="pfx-c-tones__seed-color" style={{ backgroundColor: seed }} aria-hidden="true" />
        <span>Base</span>
        <code>{seed.toUpperCase()}</code>
        <small>Picker color</small>
      </div>
      <div className="pfx-c-palette-ribbon pfx-c-tones__ribbon" aria-label="Generated tones">
        {tones.map(tone => {
          const contrast = textContrast(tone.hex);
          return (
            <button type="button" key={tone.index}
              className={tone.index === selected ? "pfx-is-selected" : ""}
              style={{ backgroundColor: tone.hex, color: contrast.color }}
              onClick={() => selectTone(tone.index)}
              aria-pressed={tone.index === selected}
              aria-label={"Select tone " + (tone.index + 1) + " " + tone.hex}>
              <small>{String(tone.index + 1).padStart(2, "0")}</small>
              <span>{tone.hex.toUpperCase()}</span>
              {tone.locked && <b aria-label="Base locked" title="Base color locked">●</b>}
              {tone.edited && <b aria-label="Manually edited" title="Manually adjusted">✦</b>}
            </button>
          );
        })}
      </div>
      <details className="pfx-c-tones__settings" open>
        <summary><strong>Generator</strong><span>Scale controls</span></summary>
        <div className="pfx-c-tones__fields">
          <label className="pfx-c-tones__field">
            <span>Number of tones <strong>{settings.count}</strong></span>
            <input type="range" min={3} max={16} step={1} value={settings.count}
              onChange={event => updateSettings({ count: Number(event.target.value) })}
              aria-label="Number of tones" />
          </label>
          <div className="pfx-c-tones__field-row">
            <label className="pfx-c-tones__field">
              <span>Darkest <strong>{settings.min}%</strong></span>
              <input type="range" min={0} max={Math.min(settings.max - 1, settings.lockBase ? Math.floor(seedLightness) : 99)}
                step={1} value={settings.min}
                onChange={event => updateSettings({ min: Number(event.target.value) })}
                aria-label="Minimum lightness" />
            </label>
            <label className="pfx-c-tones__field">
              <span>Lightest <strong>{settings.max}%</strong></span>
              <input type="range" min={Math.max(settings.min + 1, settings.lockBase ? Math.ceil(seedLightness) : 1)}
                max={100} step={1} value={settings.max}
                onChange={event => updateSettings({ max: Number(event.target.value) })}
                aria-label="Maximum lightness" />
            </label>
          </div>
          <label className="pfx-c-tones__field">
            <span>Chroma intensity <strong>{settings.chroma}%</strong></span>
            <input type="range" min={0} max={180} step={1} value={settings.chroma}
              onChange={event => updateSettings({ chroma: Number(event.target.value) })}
              aria-label="Chroma intensity" />
          </label>
          <div className="pfx-c-tones__options">
            <div className="pfx-c-tones__distribution" role="group" aria-label="Tone distribution">
              {(["even", "shadows", "highlights"] as ToneDistribution[]).map(item => (
                <button key={item} type="button" aria-pressed={settings.distribution === item}
                  onClick={() => updateSettings({ distribution: item })}>
                  {item === "even" ? "Even" : item === "shadows" ? "Darks" : "Lights"}
                </button>
              ))}
            </div>
            <label className="pfx-c-tones__lock">
              <input type="checkbox" checked={settings.lockBase}
                onChange={event => setLock(event.target.checked)}
                aria-label="Lock base color in scale" />
              <span>Lock base</span>
            </label>
          </div>
          <button className="pfx-c-tones__reset" type="button"
            onClick={() => { setSettings({ ...DEFAULT_TONES }); setOverrides({}); }}>Reset generator</button>
        </div>
      </details>
      {selectedTone && (
        <section className="pfx-c-tones__inspector" aria-label="Selected tone inspector">
          <div className="pfx-c-tones__inspector-head">
            <strong>Tone {String(selectedTone.index + 1).padStart(2, "0")}</strong>
            <span>{selectedTone.locked ? "Base locked" : selectedTone.edited ? "Manual" : "Generated"}</span>
          </div>
          <div className="pfx-c-tones__preview"
            style={{ backgroundColor: selectedTone.hex, color: foreground.color }}>
            <strong>{selectedTone.hex.toUpperCase()}</strong>
            <span>Contrast {foreground.ratio.toFixed(2)}:1</span>
          </div>
          <div className="pfx-c-tones__tone-actions">
            <button type="button" onClick={() => void copy(selectedTone.hex.toUpperCase(), "Tone HEX copied")}>Copy HEX</button>
            <button type="button" onClick={() => commitColor(selectedTone.hex)}>Use color</button>
          </div>
          <details className="pfx-c-tones__manual">
            <summary>Fine-tune tone</summary>
            <div className="pfx-c-tones__manual-controls">
              <label className="pfx-c-tones__field">
                <span>Lightness <strong>{Math.round(selectedTone.lightness)}%</strong></span>
                <input type="range" min={0} max={100} step={1}
                  value={Math.round(selectedTone.lightness)} disabled={selectedTone.locked}
                  aria-label="Selected tone lightness"
                  onChange={event => adjustSelected({ lightness: Number(event.target.value) })} />
              </label>
              <label className="pfx-c-tones__field">
                <span>Chroma <strong>{Math.round(selectedTone.chroma)}%</strong></span>
                <input type="range" min={0} max={180} step={1}
                  value={Math.round(selectedTone.chroma)} disabled={selectedTone.locked}
                  aria-label="Selected tone chroma"
                  onChange={event => adjustSelected({ chroma: Number(event.target.value) })} />
              </label>
              <button type="button" disabled={!selectedTone.edited || selectedTone.locked}
                onClick={clearEdit}>Reset tone</button>
              {selectedTone.locked && <p>Unlock the base to edit this tone.</p>}
            </div>
          </details>
        </section>
      )}
      <p className="pfx-c-tones__status" role="status" aria-live="polite">{status}</p>
    </section>
  );
}
