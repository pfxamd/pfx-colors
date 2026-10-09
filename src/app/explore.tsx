import { useMemo, useState } from "react";
import { copyColorText } from "./clipboard";
import { indexFromRgb, NAMED_COLORS, normalizeHex, rgbPage, RGB_PAGE_SIZE, RGB_TOTAL } from "./color-library";

const LAST_PAGE = Math.floor((RGB_TOTAL - 1) / RGB_PAGE_SIZE);
const QUICK_RANGES = [
  ["Red", "#e44847"], ["Orange", "#e99932"], ["Yellow", "#e0cb44"],
  ["Green", "#3cba7d"], ["Cyan", "#4bc7d2"], ["Blue", "#5472dc"],
  ["Violet", "#9c66d8"], ["Neutral", "#888888"],
] as const;

type Props = {
  activeHex: string;
  select: (hex: string) => void;
  openTones: (hex: string) => void;
  favorites: readonly string[];
  toggleFavorite: (hex: string) => void;
};

export function Explore({ activeHex, select, openTones, favorites, toggleFavorite }: Props) {
  const [mode, setMode] = useState<"named" | "rgb">("named");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(() =>
    Math.floor((indexFromRgb("#8b89aa") ?? 0) / RGB_PAGE_SIZE));
  const [selectedHex, setSelectedHex] = useState(activeHex);
  const [status, setStatus] = useState("");

  const visible = useMemo(() => {
    if (mode === "rgb") return rgbPage(page).map(hex => ({ name: "", hex }));
    const match = query.trim().toLowerCase();
    return NAMED_COLORS.filter(([name, hex]) =>
      !match || name.toLowerCase().includes(match) || hex.includes(match))
      .map(([name, hex]) => ({ name, hex }));
  }, [mode, page, query]);

  const jump = (hex: string) => {
    const index = indexFromRgb(hex);
    if (index === null) return;
    setMode("rgb");
    setPage(Math.floor(index / RGB_PAGE_SIZE));
    setSelectedHex(hex);
    select(hex);
    setStatus("Located " + hex.toUpperCase() + " in the complete RGB catalog");
  };

  const find = () => {
    const hex = normalizeHex(query);
    if (hex) jump(hex);
    else if (query.trim()) {
      setMode("named");
      setStatus("Showing named color matches");
    }
  };

  const copy = async (hex: string) => {
    setStatus(await copyColorText(hex.toUpperCase())
      ? "Copied " + hex.toUpperCase() : "Clipboard unavailable");
  };

  return (
    <section className="pfx-c-explore pfx-v2__page" aria-label="Explore colors">
      <div className="pfx-v2__page-heading">
        <div><span className="pfx-v2__eyebrow">COLOR DISCOVERY</span>
          <h1>Explore color.</h1>
          <p>Find an exact shade, browse named colors, or navigate the complete 24-bit RGB space.</p></div>
        <div className="pfx-v2__mode" role="group" aria-label="Explore mode">
          <button type="button" className={mode === "named" ? "pfx-is-active" : ""}
            aria-pressed={mode === "named"} onClick={() => { setMode("named"); setStatus(""); }}>Named</button>
          <button type="button" className={mode === "rgb" ? "pfx-is-active" : ""}
            aria-pressed={mode === "rgb"} onClick={() => { setMode("rgb"); setStatus(""); }}>All RGB</button>
        </div>
      </div>

      <div className="pfx-v2__toolbar">
        <form className="pfx-v2__search" onSubmit={event => { event.preventDefault(); find(); }}>
          <label htmlFor="pfx-explore-search">Find a color</label>
          <input id="pfx-explore-search" type="search" value={query}
            placeholder="Color name or #RRGGBB" onChange={event => setQuery(event.target.value)} />
          <button type="submit">Find</button>
        </form>
        <div className="pfx-v2__quick-ranges" aria-label="Jump to color family">
          {QUICK_RANGES.map(([name, hex]) => (
            <button key={name} type="button" onClick={() => jump(hex)}
              title={"Jump to " + name} aria-label={"Jump to " + name}>
              <span style={{ backgroundColor: hex }} />{name}
            </button>
          ))}
        </div>
      </div>

      {mode === "rgb" && (
        <div className="pfx-v2__pager">
          <span>{RGB_TOTAL.toLocaleString("en-US")} distinct RGB colors · {RGB_PAGE_SIZE} per page</span>
          <div>
            <button type="button" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</button>
            <label>Page <input type="number" min={1} max={LAST_PAGE + 1} value={page + 1}
              onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= LAST_PAGE + 1) setPage(value - 1); }} />
              <span> / {(LAST_PAGE + 1).toLocaleString("en-US")}</span></label>
            <button type="button" disabled={page === LAST_PAGE}
              onClick={() => setPage(p => Math.min(LAST_PAGE, p + 1))}>Next</button>
          </div>
        </div>
      )}

      <div className="pfx-v2__swatches" aria-label="Color swatches">
        {visible.map(({ name, hex }) => (
          <article className={"pfx-v2__swatch" + (selectedHex === hex ? " pfx-is-selected" : "")}
            key={hex}>
            <button className="pfx-v2__swatch-color" type="button" style={{ backgroundColor: hex }}
              onClick={() => { select(hex); setSelectedHex(hex); }} aria-label={"Select " + (name || hex)}>
              <span className="pfx-v2__swatch-marker">{selectedHex === hex ? "✓" : ""}</span>
            </button>
            <div className="pfx-v2__swatch-info">
              {name && <strong title={name}>{name}</strong>}
              <span>{hex.toUpperCase()}</span>
            </div>
            <div className="pfx-v2__swatch-actions">
              <button type="button" onClick={() => void copy(hex)} aria-label={"Copy " + hex}>Copy</button>
              <button type="button" onClick={() => toggleFavorite(hex)}
                aria-label={(favorites.includes(hex) ? "Remove favorite " : "Save favorite ") + hex}
                aria-pressed={favorites.includes(hex)}>{favorites.includes(hex) ? "★" : "☆"}</button>
            </div>
          </article>
        ))}
      </div>
      {visible.length === 0 && <p className="pfx-v2__empty">No named colors match this search. Enter a HEX code to explore its exact location.</p>}
      <div className="pfx-v2__selection">
        <div className="pfx-v2__selection-swatch" style={{ backgroundColor: selectedHex }} />
        <div><small>SELECTED COLOR</small><strong>{selectedHex.toUpperCase()}</strong></div>
        <button type="button" onClick={() => void copy(selectedHex)}>Copy HEX</button>
        <button type="button" onClick={() => openTones(selectedHex)}>Create Tones →</button>
        <span role="status" aria-live="polite">{status}</span>
      </div>
    </section>
  );
}
