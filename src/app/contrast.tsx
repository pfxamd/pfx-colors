import { useEffect, useState } from "react";
import { copyColorText } from "./clipboard";
import { normalizeHex } from "./color-library";
import { contrastCriteria, readableInk } from "./contrast-model";
import { useStoredState, isHex } from "./workspace-state";

function HexField({ label, value, onChange, current }: {
  label: string; value: string; onChange: (value: string) => void; current: string;
}) {
  const [draft, setDraft] = useState(value.toUpperCase());
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(value.toUpperCase()); setInvalid(false); }, [value]);
  const commit = () => {
    const candidate = draft.startsWith("#") ? draft : "#" + draft;
    const hex = /^#[a-f0-9]{6}$/i.test(candidate) ? normalizeHex(candidate) : null;
    if (!hex) { setInvalid(true); return; }
    setInvalid(false); onChange(hex); setDraft(hex.toUpperCase());
  };
  return <div className="pfx-contrast__field">
    <label>{label}<div className="pfx-contrast__field-row">
      <input type="color" aria-label={label + " picker"} value={value}
        onChange={event => onChange(event.target.value)} />
      <input aria-label={label + " HEX"} value={draft} maxLength={7} spellCheck={false}
        aria-invalid={invalid}
        onChange={event => { setDraft(event.target.value); setInvalid(false); }}
        onBlur={commit} onKeyDown={event => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") { setDraft(value.toUpperCase()); setInvalid(false); }
        }} />
    </div></label>
    <button type="button" onClick={() => onChange(current)}>Use active</button>
    {invalid && <small role="alert">Enter a valid 6-digit HEX color</small>}
  </div>;
}

export function Contrast({ currentHex }: { currentHex: string }) {
  const [foreground, setForeground] = useStoredState("pfx-colors.contrast.foreground.v1", "#252a3a", isHex);
  const [background, setBackground] = useStoredState("pfx-colors.contrast.background.v1", "#ffffff", isHex);
  const [status, setStatus] = useState("");
  const { ratio, criteria } = contrastCriteria(foreground, background);
  const copy = async () => {
    const css = "color: " + foreground.toUpperCase() + ";\nbackground-color: " +
      background.toUpperCase() + ";";
    setStatus(await copyColorText(css) ? "CSS copied" : "Clipboard unavailable");
  };
  return <section className="pfx-v2__page pfx-contrast" aria-label="Color contrast checker">
    <div className="pfx-v2__page-heading"><div>
      <span className="pfx-v2__eyebrow">ACCESSIBLE COLOR PAIRS</span>
      <h1>Contrast.</h1>
      <p>Test text and background colors against WCAG contrast thresholds.</p>
    </div></div>
    <div className="pfx-contrast__layout">
      <div className="pfx-contrast__sidebar">
        <div className="pfx-contrast__head"><strong>01 / COLORS</strong><span>Opaque HEX</span></div>
        <div className="pfx-contrast__inputs">
          <HexField label="Text color" value={foreground} current={currentHex} onChange={setForeground} />
          <button className="pfx-contrast__swap" type="button" aria-label="Swap contrast colors"
            onClick={() => { setForeground(background); setBackground(foreground); }}>⇅ Swap colors</button>
          <HexField label="Background color" value={background} current={currentHex} onChange={setBackground} />
        </div>
        <div className="pfx-contrast__ratio"><span>CONTRAST RATIO</span>
          <strong>{ratio.toFixed(2)}:1</strong>
          <span className={ratio >= 4.5 ? "pfx-contrast__pass" : "pfx-contrast__fail"}>
            {ratio >= 4.5 ? "AA normal text passes" : "AA normal text fails"}</span>
        </div>
        <div className="pfx-contrast__actions">
          <button type="button" onClick={() => setForeground(readableInk(background))}>Find readable text</button>
          <button type="button" onClick={() => void copy()}>Copy CSS</button>
        </div>
        <p role="status" aria-live="polite">{status}</p>
      </div>
      <div className="pfx-contrast__main">
        <div className="pfx-contrast__head"><strong>02 / LIVE PREVIEW</strong><span>Text on background</span></div>
        <div className="pfx-contrast__preview" style={{color:foreground,backgroundColor:background}}>
          <span>COLOR PREVIEW / PFx</span>
          <h2>Color is context.</h2>
          <p>Check how readable these colors are before applying them in your work.</p>
          <div className="pfx-contrast__sample">Sample interface label</div>
          <small>0123456789 · Aa Bb Cc</small>
        </div>
        <div className="pfx-contrast__head"><strong>03 / WCAG 2.2 TEXT RESULTS</strong><span>Contrast thresholds</span></div>
        <div className="pfx-contrast__criteria">{criteria.map(c => <div key={c.label}>
          <div><strong>{c.label}</strong><span>Minimum {c.threshold}:1</span></div>
          <span className={c.passes ? "pfx-contrast__pass" : "pfx-contrast__fail"}>
            {c.passes ? "Pass" : "Fail"}</span>
        </div>)}</div>
        <p className="pfx-contrast__note">Text contrast only. Other accessibility requirements still apply.</p>
      </div>
    </div>
  </section>;
}