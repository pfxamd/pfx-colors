import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { copyColorText } from "./clipboard";
import type { ThemePreference, ResolvedTheme } from "./theme";

export type ToolId = "home" | "explore" | "picker" | "tones" | "harmony" | "gradient" | "collections";
export const TOOLS: ReadonlyArray<{ id: ToolId; label: string; key: string }> = [
  { id: "home", label: "Home", key: "0" },
  { id: "explore", label: "Explore", key: "5" },
  { id: "picker", label: "Picker", key: "1" },
  { id: "tones", label: "Tones", key: "2" },
  { id: "harmony", label: "Harmony", key: "3" },
  { id: "gradient", label: "Gradient", key: "4" },
  { id: "collections", label: "Collections", key: "6" },
];

type Props = {
  engine: "legacy" | "rust";
  activeTool: ToolId;
  navigate: (tool: ToolId) => void;
  theme: ResolvedTheme;
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
  currentHex: string;
  setColor: (hex: string) => void;
  gamut: { srgb: boolean; p3: boolean };
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  children: ReactNode;
};

function ControlIcon({ name }: { name: "edit" | "copy" | "undo" | "redo" }) {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true">
    {name === "edit" && <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z" />
    </>}
    {name === "copy" && <>
      <rect x="8" y="8" width="13" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </>}
    {name === "undo" && <>
      <path d="M3 7v6h6" /><path d="M3 13a9 9 0 1 1 2.9 6.5" />
    </>}
    {name === "redo" && <>
      <path d="M21 7v6h-6" /><path d="M21 13a9 9 0 1 0-2.9 6.5" />
    </>}
  </svg>;
}

function normalizedHex(value: string): string | null {
  const code = value.trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(code) ? "#" + code.toUpperCase() : null;
}

function CurrentColorControl({ value, setColor, gamut }: {
  value: string;
  setColor: (hex: string) => void;
  gamut: Props["gamut"];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value.toUpperCase());
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const skipBlur = useRef(false);

  useEffect(() => {
    setDraft(value.toUpperCase());
    setEditing(false);
    setError("");
  }, [value]);

  function beginEdit() {
    if (editing) return;
    setEditing(true);
    setError("");
    setCopied("");
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.select();
    });
  }
  function restore() {
    setDraft(value.toUpperCase());
    setEditing(false);
    setError("");
  }
  function apply() {
    const next = normalizedHex(draft);
    if (!next) {
      setError("Enter a 6-digit HEX color");
      return false;
    }
    try {
      if (next.toLowerCase() !== value.toLowerCase()) setColor(next);
      setDraft(next);
      setEditing(false);
      setError("");
      return true;
    } catch {
      setError("Color could not be applied");
      return false;
    }
  }
  async function copy() {
    const result = await copyColorText(value.toUpperCase());
    setCopied(result ? "Copied" : "Copy unavailable");
  }
  return <div className={"pfx-v2__color-control" + (editing ? " pfx-is-editing" : "")}
    role="group" aria-label="Active color">
    <span className="pfx-v2__color-chip" style={{ backgroundColor: value } as CSSProperties}
      aria-label={"Current color swatch " + value.toUpperCase()} role="img"
      title={"Color gamut: sRGB " + (gamut.srgb ? "✓" : "—") +
        " · P3 " + (gamut.p3 ? "✓" : "—")} />
    <div className="pfx-v2__hex-wrap">
      <input ref={input} className="pfx-v2__hex-value" aria-label="Current color"
        aria-invalid={Boolean(error)} aria-describedby={error ? "pfx-hex-error" : undefined}
        readOnly={!editing} spellCheck={false} autoComplete="off"
        maxLength={7} value={draft} onClick={beginEdit}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (!editing) beginEdit();
            else if (apply()) { skipBlur.current = true; event.currentTarget.blur(); }
          } else if (event.key === "Escape") {
            skipBlur.current = true;
            restore();
            event.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (skipBlur.current) { skipBlur.current = false; return; }
          if (editing && !apply()) restore();
        }} />
      <span className="pfx-v2__color-status" role="status" aria-live="polite"
        id="pfx-hex-error">{error || copied}</span>
    </div>
    <button type="button" className="pfx-v2__icon-btn pfx-v2__edit-color"
      onClick={beginEdit} aria-label="Edit current HEX" title="Edit HEX color">
      <ControlIcon name="edit" />
    </button>
    <button type="button" className="pfx-v2__icon-btn pfx-v2__copy-color"
      onClick={() => void copy()} aria-label="Copy current color" title="Copy HEX">
      <ControlIcon name="copy" />
    </button>
  </div>;
}

export function WorkspaceShell(props: Props) {
  const tabsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = tabsRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) return;
    const bounds = nav.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    const gutter = 12;
    if (item.left < bounds.left + gutter) {
      nav.scrollLeft += item.left - bounds.left - gutter;
    } else if (item.right > bounds.right - gutter) {
      nav.scrollLeft += item.right - bounds.right + gutter;
    }
  }, [props.activeTool]);
  return (
    <div className="pfx-l-app pfx-v2" data-theme={props.theme}>
      <header className="pfx-c-header">
        <div className="pfx-c-brand">
          <img src="./logo.svg" alt="" />
          <strong>PFx Colors</strong>
          <em className="pfx-v2__alpha-badge" aria-label="Alpha version 0.2">Alpha 0.2</em>
          <span>COLOR WORKSPACE</span>
        </div>
        <nav className="pfx-c-tabs" ref={tabsRef} aria-label="Color tools">
          {TOOLS.map(tool => (
            <button type="button" key={tool.id}
              className={props.activeTool === tool.id ? "pfx-is-current" : ""}
              aria-current={props.activeTool === tool.id ? "page" : undefined}
              onClick={() => props.navigate(tool.id)}>
              {tool.label}
            </button>
          ))}
        </nav>
        <div className="pfx-v2__header-actions">
          <CurrentColorControl value={props.currentHex} setColor={props.setColor} gamut={props.gamut} />
          <div className="pfx-v2__history" role="group" aria-label="Color history">
            <button type="button" className="pfx-v2__icon-btn" aria-label="UNDO"
              title="Undo (Ctrl+Z)" disabled={!props.canUndo} onClick={props.undo}>
              <ControlIcon name="undo" />
            </button>
            <button type="button" className="pfx-v2__icon-btn" aria-label="REDO"
              title="Redo (Ctrl+Shift+Z)" disabled={!props.canRedo} onClick={props.redo}>
              <ControlIcon name="redo" />
            </button>
          </div>
          <div className="pfx-v2__theme" role="group" aria-label="Appearance">
            {(["light", "dark", "system"] as const).map(option => (
              <button key={option} type="button" aria-label={option + " theme"}
                aria-pressed={props.preference === option}
                className={props.preference === option ? "pfx-is-active" : ""}
                onClick={() => props.setPreference(option)}>
                {option === "light" ? "Light" : option === "dark" ? "Dark" : "Auto"}
              </button>
            ))}
          </div>
          <span className="pfx-c-engine-label" data-engine={props.engine}>
            {props.engine === "rust" ? "RUST / CORE" : "LEGACY / CORE"}
          </span>
        </div>
      </header>
      <main className="pfx-l-stage">{props.children}</main>
    </div>
  );
}
