import type { ReactNode } from "react";
import { useState } from "react";
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
  currentInput: ReactNode;
  gamut: { srgb: boolean; p3: boolean };
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  children: ReactNode;
};

export function WorkspaceShell(props: Props) {
  const [copyStatus, setCopyStatus] = useState("");
  const copyCurrent = async () => {
    const copied = await copyColorText(props.currentHex.toUpperCase());
    setCopyStatus(copied ? "Copied" : "Copy unavailable");
  };

  return (
    <div className="pfx-l-app pfx-v2" data-theme={props.theme}>
      <header className="pfx-c-header">
        <div className="pfx-c-brand">
          <img src="./logo.svg" alt="" />
          <strong>PFx Colors</strong>
          <span>COLOR WORKSPACE</span>
        </div>
        <nav className="pfx-c-tabs" aria-label="Color tools">
          {TOOLS.map(tool => (
            <button type="button" key={tool.id}
              className={props.activeTool === tool.id ? "pfx-is-current" : ""}
              aria-current={props.activeTool === tool.id ? "page" : undefined}
              onClick={() => { props.navigate(tool.id); setCopyStatus(""); }}>
              {tool.label}
            </button>
          ))}
        </nav>
        <div className="pfx-v2__header-actions">
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
      <footer className="pfx-c-dock">
        <div className="pfx-c-current">
          <span className="pfx-v2__current-chip" style={{ backgroundColor: props.currentHex }} />
          <div className="pfx-v2__current-value">
            <small>CURRENT COLOR</small>
            {props.currentInput}
          </div>
          <button className="pfx-v2__copy" type="button" onClick={() => void copyCurrent()}
            aria-label="Copy current color" title="Copy HEX">
            Copy HEX
          </button>
          <span className="pfx-v2__copy-feedback" role="status" aria-live="polite">{copyStatus}</span>
        </div>
        <div className="pfx-c-gamut" aria-label="Color gamut">
          <span>sRGB {props.gamut.srgb ? "●" : "○"}</span>
          <span>P3 {props.gamut.p3 ? "●" : "○"}</span>
        </div>
        <div className="pfx-c-history">
          <button type="button" disabled={!props.canUndo} onClick={props.undo}>↶ UNDO</button>
          <button type="button" disabled={!props.canRedo} onClick={props.redo}>↷ REDO</button>
        </div>
      </footer>
    </div>
  );
}
