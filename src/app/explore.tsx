import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { ColorInput } from "@pfx/color-core";
import { copyColorText } from "./clipboard";
import {
  INITIAL_CSS_COLORS, LIBRARIES, TOTAL_COLOR_ENTRIES,
  loadColorCatalog, type CatalogId, type ColorRecord,
} from "./explore-catalog";
import {
  COLOR_FAMILIES, GALLERY_PALETTES, arrangeGalleryColors, uniqueGalleryColors,
  type ColorFamily, type GalleryColor, type GalleryPalette,
} from "./explore-gallery";

type Props = {
  activeHex: string;
  select: (hex: ColorInput) => void;
  favorites: readonly string[];
  toggleFavorite: (hex: string) => void;
  saveSet: (name: string, colors: readonly string[]) => void;
};

type View = "colors" | "palettes" | "saved";
type Mood = GalleryPalette["mood"] | "All";
const MOODS: readonly Mood[] = ["All", "Calm", "Nature", "Soft", "Warm", "Earth", "Bold", "Dark"];
const PAGE_SIZE = 80;
const format = (value: number) => value.toLocaleString("en-US");

function SearchSymbol() {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
    fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="10.7" cy="10.7" r="6.8" /><path d="m16 16 5 5" />
  </svg>;
}
function Heart({ filled }: { filled: boolean }) {
  return <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"
    fill={filled ? "currentColor" : "none"} stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.6 4.9a5.4 5.4 0 0 0-7.6 0l-1 1-1-1a5.4 5.4 0 0 0-7.6 7.6L12 21l8.6-8.5a5.4 5.4 0 0 0 0-7.6Z" />
  </svg>;
}

export function Explore({ activeHex, select, favorites, toggleFavorite, saveSet }: Props) {
  const [view, setView] = useState<View>("palettes");
  const [family, setFamily] = useState<ColorFamily | null>(null);
  const [query, setQuery] = useState("");
  const delayedQuery = useDeferredValue(query.trim().toLowerCase());
  const [mood, setMood] = useState<Mood>("All");
  const [shuffle, setShuffle] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [catalogs, setCatalogs] = useState<Partial<Record<CatalogId, ColorRecord[]>>>({
    css: INITIAL_CSS_COLORS,
  });
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState("");

  const searching = Boolean(query.trim());
  const needColors = searching || view !== "palettes";
  const ready = LIBRARIES.every(library => Boolean(catalogs[library.id]));

  useEffect(() => {
    if (!needColors || ready) return;
    let cancelled = false;
    setError("");
    void Promise.all(LIBRARIES.filter(item => item.id !== "css" && !catalogs[item.id])
      .map(async item => [item.id, await loadColorCatalog(item.id as Exclude<CatalogId, "css">)] as const))
      .then(loaded => {
        if (cancelled) return;
        setCatalogs(previous => {
          const next = { ...previous };
          for (const [id, colors] of loaded) next[id] = colors;
          return next;
        });
      })
      .catch(cause => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load color libraries");
      });
    return () => { cancelled = true; };
    // The source files only need to load once per session; retry is explicit.
  }, [needColors, ready, retry]);

  const allColors = useMemo(() => ready ? uniqueGalleryColors(
    LIBRARIES.flatMap(library => catalogs[library.id] ?? [])) : [], [ready, catalogs]);

  const arranged = useMemo(() => arrangeGalleryColors(allColors, family),
    [allColors, family]);

  const matching = useMemo(() => {
    if (!delayedQuery) return arranged;
    const normalized = delayedQuery.replace(/\s+/g, "");
    const hexSearch = normalized.replace(/^#/, "");
    return allColors.filter(item =>
      item.name.toLowerCase().replace(/\s+/g, "").includes(normalized) ||
      item.hex.slice(1).includes(hexSearch));
  }, [delayedQuery, arranged, allColors]);

  const savedColors = useMemo<GalleryColor[]>(() =>
    favorites.map(hex => allColors.find(item => item.hex === hex.toLowerCase()))
      .filter((value): value is GalleryColor => Boolean(value)), [favorites, allColors]);

  const list = view === "saved" && !searching ? savedColors : matching;
  const shown = list.slice(0, limit);
  const palettes = useMemo(() => {
    const filtered = GALLERY_PALETTES.filter(palette => mood === "All" || palette.mood === mood);
    if (filtered.length < 2) return filtered;
    const offset = shuffle % filtered.length;
    return [...filtered.slice(offset), ...filtered.slice(0, offset)];
  }, [mood, shuffle]);

  const paletteMode = !searching && view === "palettes";
  const currentFamily = COLOR_FAMILIES.find(item => item.id === family);
  const showingFavorites = view === "saved" && !searching;
  const heading = searching ? "Search results" : showingFavorites ? "Saved colors" :
    family ? currentFamily?.name + " colors" : "Discover colors";
  const loading = needColors && !ready && !error;

  function openView(next: View) {
    setView(next);
    setQuery("");
    setFamily(null);
    setLimit(PAGE_SIZE);
    setStatus("");
  }

  function chooseFamily(next: ColorFamily) {
    setFamily(previous => previous === next && view === "colors" ? null : next);
    setView("colors");
    setQuery("");
    setLimit(PAGE_SIZE);
    setStatus("");
  }

  async function copy(value: string) {
    const ok = await copyColorText(value.toUpperCase());
    setStatus(ok ? "Copied " + value.toUpperCase() : "Clipboard unavailable");
  }

  function pick(hex: string) {
    select(hex);
    setStatus("Selected " + hex.toUpperCase());
  }

  function paletteCard(palette: GalleryPalette) {
    return <article className="pfx-explore__palette" key={palette.id}>
      <div className="pfx-explore__palette-strip">
        {palette.colors.map((hex, i) =>
          <button key={i} type="button" className="pfx-explore__palette-swatch"
            style={{ backgroundColor: hex }}
            title={"Use " + hex.toUpperCase()}
            aria-label={"Use " + hex.toUpperCase() + " from " + palette.title}
            onClick={() => pick(hex)} />)}
      </div>
      <div className="pfx-explore__palette-footer">
        <div className="pfx-explore__palette-meta">
          <strong>{palette.title}</strong>
          <span>{palette.mood} · {palette.colors.length} colors</span>
        </div>
        <div className="pfx-explore__palette-actions">
          <button type="button" aria-label={"Copy " + palette.title + " palette"}
            title="Copy all HEX values" onClick={() => void copy(palette.colors.join(", "))}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2" />
              <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>
          </button>
          <button type="button" aria-label={"Save " + palette.title + " palette"}
            title="Save palette to Collections"
            onClick={() => { saveSet(palette.title, palette.colors);
              setStatus(palette.title + " saved to Collections"); }}>
            <Heart filled={false} />
          </button>
        </div>
      </div>
    </article>;
  }

  return <section className="pfx-explore pfx-v2__page" aria-label="Explore colors">
    <div className="pfx-explore__scroll">
      <div className="pfx-explore__content">
        <header className="pfx-explore__intro">
          <div>
            <span className="pfx-explore__eyebrow">YOUR COLOR SPACE</span>
            <h1>Explore colors<span aria-hidden="true">.</span></h1>
            <p>Find a color. Discover something beautiful.</p>
          </div>
          <button type="button" className={"pfx-explore__saved-link" + (view === "saved" && !searching ? " is-active" : "")}
            onClick={() => openView("saved")} aria-label="Open saved colors">
            <Heart filled={view === "saved" && !searching} />
            <span>Saved</span>{favorites.length > 0 && <small>{favorites.length}</small>}
          </button>
        </header>

        <label className="pfx-explore__search">
          <SearchSymbol />
          <input type="search" aria-label="Search colors by name or HEX"
            value={query} placeholder="Search a color name or HEX code..."
            autoComplete="off" spellCheck={false}
            onChange={event => {
              setQuery(event.target.value);
              setLimit(PAGE_SIZE);
              if (event.target.value.trim()) setFamily(null);
            }} />
          {query ? <button type="button" className="pfx-explore__search-clear"
            aria-label="Clear search" onClick={() => setQuery("")}>×</button> :
            <span className="pfx-explore__search-hint">From {format(TOTAL_COLOR_ENTRIES)} entries</span>}
        </label>

        <div className="pfx-explore__family-head">
          <h2>Explore by color</h2>
          {family && !searching &&
            <button type="button" onClick={() => { setFamily(null); setLimit(PAGE_SIZE); }}>Clear selection ×</button>}
        </div>
        <div className="pfx-explore__families" role="group" aria-label="Choose a color family">
          {COLOR_FAMILIES.map(item =>
            <button type="button" key={item.id} aria-pressed={family === item.id && view === "colors" && !searching}
              className={"pfx-explore__family" +
                (family === item.id && view === "colors" && !searching ? " is-active" : "")}
              onClick={() => chooseFamily(item.id)}>
              <span className="pfx-explore__family-swatch"
                style={{ backgroundColor: item.swatch }} aria-hidden="true" />
              <span>{item.name}</span>
            </button>)}
        </div>

        <div className="pfx-explore__section-header">
          <div className="pfx-explore__tabs" role="group" aria-label="Explore sections">
            <button type="button" className={!paletteMode ? "is-active" : ""}
              aria-pressed={!paletteMode} onClick={() => openView("colors")}>Colors</button>
            <button type="button" className={paletteMode ? "is-active" : ""}
              aria-pressed={paletteMode} onClick={() => openView("palettes")}>Palettes</button>
          </div>
          {paletteMode &&
            <button type="button" className="pfx-explore__shuffle"
              onClick={() => setShuffle(value => value + 3)}>
              <span aria-hidden="true">↻</span> More inspiration
            </button>}
        </div>

        {paletteMode ? <>
          <div className="pfx-explore__gallery-heading">
            <div><h2>Color stories</h2><p>Handpicked combinations for your next project.</p></div>
            <span>{palettes.length} palettes</span>
          </div>
          <div className="pfx-explore__moods" role="group" aria-label="Palette moods">
            {MOODS.map(item => <button type="button" key={item}
              className={mood === item ? "is-active" : ""}
              aria-pressed={mood === item}
              onClick={() => { setMood(item); setShuffle(0); }}>{item}</button>)}
          </div>
          <div className="pfx-explore__palette-grid">
            {palettes.map(paletteCard)}
          </div>
        </> : <>
          <div className="pfx-explore__gallery-heading">
            <div><h2>{heading}</h2>
              <p>{searching ? "Matching colors from all libraries." :
                showingFavorites ? "Colors you have saved." :
                family ? "Every matching color from our libraries, not generated shades." :
                "A colorful mix from our libraries. Choose a family above to see more."}</p>
            </div>
            {!loading && !error && <span>{format(list.length)} colors</span>}
          </div>
          {loading ? <p className="pfx-explore__message" role="status">Opening color libraries…</p> :
            error ? <div className="pfx-explore__message" role="alert">
              <p>Colors could not be loaded. Please try again.</p>
              <button type="button" onClick={() => { setError(""); setRetry(value => value + 1); }}>Try again</button>
            </div> : list.length === 0 ? <div className="pfx-explore__message">
              <p>{showingFavorites ? "No saved colors yet. Save a color to see it here." :
                "No colors found. Try another name or color."}</p>
              {searching && <button type="button" onClick={() => setQuery("")}>Clear search</button>}
            </div> : <>
              <div className="pfx-explore__color-grid">
                {shown.map(({ name, hex }, index) => {
                  const loved = favorites.includes(hex);
                  return <article className="pfx-explore__color-card" key={hex + ":" + index}>
                    <div className="pfx-explore__color-preview">
                      <button type="button" className="pfx-explore__color-pick"
                        style={{ backgroundColor: hex }}
                        onClick={() => pick(hex)}
                        aria-label={"Select " + name + " " + hex.toUpperCase()}
                        title={"Select " + name} >
                        {hex.toLowerCase() === activeHex.toLowerCase() &&
                          <span className="pfx-explore__color-check" aria-hidden="true">✓</span>}
                      </button>
                      <button type="button"
                        className={"pfx-explore__favorite" + (loved ? " is-saved" : "")}
                        aria-label={(loved ? "Remove favorite " : "Save favorite ") + name}
                        aria-pressed={loved}
                        title={loved ? "Remove from saved" : "Save color"}
                        onClick={() => { toggleFavorite(hex); setStatus(loved ? "Removed from saved colors" : "Color saved"); }}>
                        <Heart filled={loved} />
                      </button>
                    </div>
                    <div className="pfx-explore__color-info">
                      <span title={name}>{name}</span>
                      <button type="button" aria-label={"Copy " + hex.toUpperCase()}
                        title="Copy HEX" onClick={() => void copy(hex)}>{hex.toUpperCase()}</button>
                    </div>
                  </article>;
                })}
              </div>
              {shown.length < list.length &&
                <button type="button" className="pfx-explore__more"
                  onClick={() => setLimit(value => value + PAGE_SIZE)}>
                  Show more colors <span>({format(list.length - shown.length)} remaining)</span>
                </button>}
            </>}
        </>}
        <footer className="pfx-explore__footer">
          <span>Colors from open-source libraries · Palettes curated by PFx</span>
          <a href="./palettes/ATTRIBUTION.txt" target="_blank" rel="noopener noreferrer">Sources & licenses ↗</a>
        </footer>
      </div>
    </div>
    <div className="pfx-explore__feedback" role="status" aria-live="polite">{status}</div>
  </section>;
}
