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
    <div className="pfx-contrast__field-head">
      <label htmlFor={"pfx-contrast-" + label.toLowerCase().replace(/\s+/g, "-")}>{label}</label>
      <button type="button" onClick={() => onChange(current)} title="Use the current workspace color">
        Use active <span aria-hidden="true">↗</span>
      </button>
    </div>
    <div className="pfx-contrast__field-row">
      <input type="color" aria-label={label + " picker"} value={value}
        onChange={event => onChange(event.target.value)} />
      <input id={"pfx-contrast-" + label.toLowerCase().replace(/\s+/g, "-")}
        aria-label={label + " HEX"} value={draft} maxLength={7}
        spellCheck={false} autoComplete="off" aria-invalid={invalid}
        onChange={event => { setDraft(event.target.value); setInvalid(false); }}
        onBlur={commit} onKeyDown={event => {
          if (event.key === "Enter") { commit(); event.currentTarget.blur(); }
          if (event.key === "Escape") { setDraft(value.toUpperCase()); setInvalid(false); }
        }} />
    </div>
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
    <div className="pfx-contrast__composition">
      <header className="pfx-contrast__heading">
        <div>
          <span className="pfx-contrast__eyebrow">COLOR / 08</span>
          <h1>Contrast</h1>
        </div>
        <span className="pfx-contrast__heading-note">Type & color study</span>
      </header>

      <div className="pfx-contrast__work">
        <div className="pfx-contrast__artwork">
          <div className="pfx-contrast__preview"
            style={{ color: foreground, backgroundColor: background }}
            aria-label="Live text and background color preview">
            <span className="pfx-contrast__preview-index">PFx — COLOR STUDY</span>
            <div className="pfx-contrast__type">
              <strong>Aa</strong>
              <span>Color is context.</span>
              <small>0123456789 / abcdef</small>
            </div>
            <div className="pfx-contrast__preview-bottom">
              <span>Foreground / Background</span>
              <span>↗</span>
            </div>
          </div>
          <div className="pfx-contrast__artwork-caption" aria-hidden="true">
            <span>01 / LIVE STUDY</span>
            <span>{foreground.toUpperCase()} <span className="pfx-contrast__caption-cross">×</span> {background.toUpperCase()}</span>
          </div>
        </div>

        <div className="pfx-contrast__tools">
          <div className="pfx-contrast__pair">
            <HexField label="Text color" value={foreground} current={currentHex} onChange={setForeground} />
            <button className="pfx-contrast__swap" type="button" aria-label="Swap contrast colors"
              onClick={() => { setForeground(background); setBackground(foreground); }}>
              <span aria-hidden="true">⇅</span> <span className="pfx-contrast__swap-label">Swap</span>
            </button>
            <HexField label="Background color" value={background} current={currentHex} onChange={setBackground} />
          </div>

          <div className="pfx-contrast__evaluation">
            <div className="pfx-contrast__ratio">
              <span className="pfx-contrast__micro">CONTRAST RATIO</span>
              <div><strong>{ratio.toFixed(2)}</strong><span>:1</span></div>
            </div>
            <div className="pfx-contrast__assessment">
              <span className={ratio >= 4.5 ? "pfx-contrast__pass" : "pfx-contrast__fail"}>
                <span className="pfx-contrast__mark" aria-hidden="true">{ratio >= 4.5 ? "●" : "○"}</span>
                {ratio >= 4.5 ? "AA text passes" : "AA text fails"}
              </span>
            </div>
          </div>

          <div className="pfx-contrast__checks" aria-label="WCAG 2.2 text contrast results">
            <div className="pfx-contrast__checks-head">
              <span className="pfx-contrast__micro">WCAG / TEXT</span>
              <span>MINIMUM</span>
            </div>
            <div className="pfx-contrast__criteria">
              {criteria.map(item => <div key={item.label} className="pfx-contrast__criterion">
                <span>{item.label}</span>
                <span>{item.threshold}:1</span>
                <strong className={item.passes ? "pfx-contrast__pass" : "pfx-contrast__fail"}>
                  {item.passes ? "Pass" : "Fail"}
                </strong>
              </div>)}
            </div>
          </div>

          <div className="pfx-contrast__actions">
            <button type="button" onClick={() => setForeground(readableInk(background))}>
              Find readable text
            </button>
            <button type="button" onClick={() => void copy()}>Copy CSS <span aria-hidden="true">↗</span></button>
          </div>
          <p className="pfx-contrast__status" role="status" aria-live="polite">{status}</p>
        </div>
      </div>
      <p className="pfx-contrast__footnote">Text contrast only. Other accessibility requirements still apply.</p>
    </div>
  </section>;
}
