import { useState } from "react";
import { copyColorText } from "./clipboard";
import type { SavedColorSet, SavedGradient } from "./use-color-library";
import { createGradient, gradientToCss } from "../rust/operations";
import { parseLibraryBackup, serializeLibraryBackup, type LibrarySnapshot } from "./library-backup";

type Props = {
  currentHex: string;
  favorites: readonly string[];
  recent: readonly string[];
  sets: readonly SavedColorSet[];
  removeSet: (id: string) => void;
  gradients: readonly SavedGradient[];
  removeGradient: (id: string) => void;
  openGradient: (saved: SavedGradient) => void;
  restoreBackup: (backup: LibrarySnapshot) => void;
  select: (hex: string) => void;
  openTones: (hex: string) => void;
  toggleFavorite: (hex: string) => void;
  clearRecent: () => void;
};

function gradientPreview(saved: SavedGradient): string {
  const draft = saved.gradient;
  try {
    return gradientToCss(createGradient(draft.stops, {
      type: draft.type, angle: draft.angle, centerX: draft.centerX,
      centerY: draft.centerY, interpolationSpace: draft.interpolationSpace, hue: "shorter",
    }));
  } catch { return "linear-gradient(90deg, #aaaaaa, #444444)"; }
}

function downloadBackup(data: string) {
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "pfx-colors-library.json";
  link.click();
  URL.revokeObjectURL(url);
}

export function Collections(props: Props) {
  const [view, setView] = useState<"favorites" | "recent" | "sets" | "gradients">("favorites");
  const [status, setStatus] = useState("");
  const colors = view === "favorites" ? props.favorites : view === "recent" ? props.recent : [];
  const copy = async (hex: string) => {
    setStatus(await copyColorText(hex.toUpperCase()) ? "Copied " + hex.toUpperCase() : "Clipboard unavailable");
  };
  const exportBackup = () => {
    downloadBackup(serializeLibraryBackup({
      favorites: [...props.favorites], recent: [...props.recent],
      sets: [...props.sets], gradients: [...props.gradients],
    }));
    setStatus("Library backup downloaded");
  };
  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error("File too large");
      const data = parseLibraryBackup(await file.text());
      props.restoreBackup(data);
      setStatus("Backup imported · Existing saved items preserved");
    } catch {
      setStatus("Could not import backup · Select a valid PFx Colors library JSON file");
    }
  };

  return (
    <section className="pfx-c-collections pfx-v2__page" aria-label="Saved colors">
      <div className="pfx-v2__page-heading">
        <div><span className="pfx-v2__eyebrow">YOUR LIBRARY</span>
          <h1>Collections.</h1>
          <p>Keep your favorite shades nearby. Recent choices are stored locally in this browser.</p>
        </div>
        <div className="pfx-collections__header-actions">
          <button type="button" onClick={exportBackup}>Export backup</button>
          <label className="pfx-collections__restore">Import backup
            <input type="file" accept=".json,application/json" aria-label="Import library backup"
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                void importBackup(file);
              }} />
          </label>
          <button className="pfx-v2__primary" type="button"
            onClick={() => props.toggleFavorite(props.currentHex)}>
            {props.favorites.includes(props.currentHex.toLowerCase()) ? "Remove current favorite" : "Save current color"}
          </button>
        </div>
      </div>
      <div className="pfx-v2__collection-tabs" role="group" aria-label="Saved color categories">
        <button type="button" aria-pressed={view === "favorites"} onClick={() => setView("favorites")}>
          Favorites <span>{props.favorites.length}</span></button>
        <button type="button" aria-pressed={view === "recent"} onClick={() => setView("recent")}>
          Recent <span>{props.recent.length}</span></button>
        <button type="button" aria-pressed={view === "sets"} onClick={() => setView("sets")}>
          Saved sets <span>{props.sets.length}</span></button>
        <button type="button" aria-pressed={view === "gradients"} onClick={() => setView("gradients")}>
          Saved gradients <span>{props.gradients.length}</span></button>
        {view === "recent" && props.recent.length > 0 &&
          <button type="button" onClick={props.clearRecent}>Clear recent</button>}
      </div>
      {view === "gradients" ? (
        props.gradients.length === 0 ? <div className="pfx-v2__empty">
          No gradients saved yet. Use Save gradient in the Gradient tool.
        </div> : <div className="pfx-c-collections__sets">
          {props.gradients.map(saved => (
            <article className="pfx-c-collections__set" key={saved.id}>
              <div className="pfx-c-collections__set-head">
                <div><strong>{saved.name}</strong>
                  <small>{saved.gradient.type} · {saved.gradient.stops.length} stops · Editable</small></div>
                <button type="button" aria-label={"Remove gradient " + saved.name}
                  onClick={() => props.removeGradient(saved.id)}>Remove</button>
              </div>
              <div className="pfx-c-collections__gradient-preview"
                role="img" aria-label={"Preview " + saved.name}
                style={{ background: gradientPreview(saved) }} />
              <div className="pfx-c-collections__set-actions">
                <button type="button" onClick={() => props.openGradient(saved)}>Edit gradient</button>
                <span>{saved.gradient.interpolationSpace.toUpperCase()}</span>
              </div>
            </article>
          ))}
        </div>
      ) : view === "sets" ? (
        props.sets.length === 0 ? <div className="pfx-v2__empty">
          No saved sets yet. Save a harmony from the Harmony tool to keep it here.
        </div> : <div className="pfx-c-collections__sets">
          {props.sets.map(set => (
            <article className="pfx-c-collections__set" key={set.id}>
              <div className="pfx-c-collections__set-head">
                <div><strong>{set.name}</strong>
                  <small>{set.colors.length} colors · Saved locally</small></div>
                <button type="button" aria-label={"Remove set " + set.name}
                  onClick={() => props.removeSet(set.id)}>Remove</button>
              </div>
              <div className="pfx-c-collections__set-colors">
                {set.colors.map((hex, index) => <button type="button"
                  key={index} style={{ backgroundColor: hex }}
                  aria-label={"Select saved color " + hex} title={hex.toUpperCase()}
                  onClick={() => props.select(hex)} />)}
              </div>
              <div className="pfx-c-collections__set-actions">
                <button type="button" onClick={() => void copy(set.colors.join("\n"))}>
                  Copy all HEX</button>
                <span>{set.colors[0].toUpperCase()} · {set.colors.at(-1)?.toUpperCase()}</span>
              </div>
            </article>
          ))}
        </div>
      ) : colors.length === 0 ? (

        <div className="pfx-v2__empty">
          {view === "favorites"
            ? "No favorites yet. Save any color from Explore, or save the active color above."
            : "No recent colors yet. Start selecting colors in the workspace."}
        </div>
      ) : (
        <div className="pfx-v2__swatches">
          {colors.map(hex => (
            <article className="pfx-v2__swatch" key={hex}>
              <button type="button" className="pfx-v2__swatch-color" style={{ backgroundColor: hex }}
                aria-label={"Select " + hex} onClick={() => props.select(hex)} />
              <div className="pfx-v2__swatch-info"><span>{hex.toUpperCase()}</span></div>
              <div className="pfx-v2__swatch-actions">
                <button type="button" onClick={() => void copy(hex)}>Copy</button>
                <button type="button" onClick={() => props.openTones(hex)}>Tones</button>
                <button type="button" onClick={() => props.toggleFavorite(hex)}
                  aria-label={(props.favorites.includes(hex) ? "Remove favorite " : "Save favorite ") + hex}>
                  {props.favorites.includes(hex) ? "★" : "☆"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="pfx-v2__status" role="status" aria-live="polite">{status}</p>
    </section>
  );
}
