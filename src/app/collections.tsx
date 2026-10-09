import { useState } from "react";
import { copyColorText } from "./clipboard";

type Props = {
  currentHex: string;
  favorites: readonly string[];
  recent: readonly string[];
  select: (hex: string) => void;
  openTones: (hex: string) => void;
  toggleFavorite: (hex: string) => void;
  clearRecent: () => void;
};

export function Collections(props: Props) {
  const [view, setView] = useState<"favorites" | "recent">("favorites");
  const [status, setStatus] = useState("");
  const colors = view === "favorites" ? props.favorites : props.recent;
  const copy = async (hex: string) => {
    setStatus(await copyColorText(hex.toUpperCase()) ? "Copied " + hex.toUpperCase() : "Clipboard unavailable");
  };

  return (
    <section className="pfx-c-collections pfx-v2__page" aria-label="Saved colors">
      <div className="pfx-v2__page-heading">
        <div><span className="pfx-v2__eyebrow">YOUR LIBRARY</span>
          <h1>Collections.</h1>
          <p>Keep your favorite shades nearby. Recent choices are stored locally in this browser.</p>
        </div>
        <button className="pfx-v2__primary" type="button"
          onClick={() => props.toggleFavorite(props.currentHex)}>
          {props.favorites.includes(props.currentHex.toLowerCase()) ? "Remove current favorite" : "Save current color"}
        </button>
      </div>
      <div className="pfx-v2__collection-tabs" role="group" aria-label="Saved color categories">
        <button type="button" aria-pressed={view === "favorites"} onClick={() => setView("favorites")}>
          Favorites <span>{props.favorites.length}</span></button>
        <button type="button" aria-pressed={view === "recent"} onClick={() => setView("recent")}>
          Recent <span>{props.recent.length}</span></button>
        {view === "recent" && props.recent.length > 0 &&
          <button type="button" onClick={props.clearRecent}>Clear recent</button>}
      </div>
      {colors.length === 0 ? (
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
