import { useEffect, useMemo, useState } from "react";
import { copyColorText } from "./clipboard";
import { NAMED_COLORS, normalizeHex, RGB_PAGE_SIZE, RGB_TOTAL } from "./color-library";
import {
  colorAt, colorIndex, DEFAULT_FILTERS, FAMILY_ANCHORS, hasExploreFilters, hexStats,
  namedMatches, pairContrast, type ExploreFilters, type Family, type RgbOrder,
} from "./explore-model";

const LAST_PAGE = Math.ceil(RGB_TOTAL / RGB_PAGE_SIZE) - 1;
const FAMILIES: Family[] = [
  "all", "red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink", "neutral",
];
const intFormat = new Intl.NumberFormat("en-US");
const clamp = (value: number) => Math.max(0, Math.min(255, value));

type Props = {
  activeHex: string;
  select: (hex: string) => void;
  openPicker: (hex: string) => void;
  openTones: (hex: string) => void;
  favorites: readonly string[];
  toggleFavorite: (hex: string) => void;
};

type Scan = { colors: string[]; nextCursor: number; end: boolean; searching: boolean; progress: number };
const EMPTY_SCAN: Scan = { colors: [], nextCursor: 0, end: false, searching: false, progress: 0 };

function similarColors(hex: string): string[] {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const deltas = [[22,0,0],[-22,0,0],[0,22,0],[0,-22,0],[0,0,22],[0,0,-22],[18,18,18],[-18,-18,-18]];
  return [...new Set(deltas.map(delta => "#" + rgb.map((channel, i) =>
    clamp(channel + delta[i]).toString(16).padStart(2, "0")).join("")))]
    .filter(color => color !== hex);
}

export function Explore({ activeHex, select, openPicker, openTones, favorites, toggleFavorite }: Props) {
  const [mode, setMode] = useState<"named" | "rgb">("named");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ExploreFilters>({ ...DEFAULT_FILTERS });
  const [namedOrder, setNamedOrder] = useState<"name" | "hue" | "lightness" | "saturation">("name");
  const [rgbOrder, setRgbOrder] = useState<RgbOrder>("spectrum");
  const [page, setPage] = useState(0);
  const [anchor, setAnchor] = useState(() => colorIndex("#8b89aa", "spectrum"));
  const [cursors, setCursors] = useState<number[]>([0]);
  const [scan, setScan] = useState<Scan>(EMPTY_SCAN);
  const [selectedHex, setSelectedHex] = useState(activeHex.toLowerCase());
  const [comparison, setComparison] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => setSelectedHex(activeHex.toLowerCase()), [activeHex]);
  const filtered = hasExploreFilters(filters);
  const named = useMemo(() => namedMatches(query, filters, namedOrder),
    [query, filters, namedOrder]);

  const setFamilyOrFilter = (change: Partial<ExploreFilters>) => {
    const next = { ...filters, ...change };
    setFilters(next);
    setPage(0);
    setCursors([0]);
    setScan(EMPTY_SCAN);
    if (next.family !== "all") setAnchor(colorIndex(FAMILY_ANCHORS[next.family], rgbOrder));
  };
  const switchOrder = (order: RgbOrder) => {
    setRgbOrder(order);
    setPage(0);
    setCursors([0]);
    const origin = filters.family === "all" ? selectedHex : FAMILY_ANCHORS[filters.family];
    setAnchor(colorIndex(origin, order));
  };
  const clearFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
    setPage(0);
    setCursors([0]);
    setScan(EMPTY_SCAN);
  };

  useEffect(() => {
    if (mode !== "rgb" || !filtered) return;
    const worker = new Worker(new URL("./explore-worker.ts", import.meta.url), { type: "module" });
    const cursor = cursors[page];
    if (cursor == null) return () => worker.terminate();
    setScan({ ...EMPTY_SCAN, searching: true, progress: cursor / RGB_TOTAL });
    worker.onmessage = (event: MessageEvent<{
      kind: "progress" | "result";
      id: number; cursor?: number; colors?: string[]; nextCursor?: number; end?: boolean;
    }>) => {
      if (event.data.id !== 1) return;
      if (event.data.kind === "progress") {
        setScan(previous => ({ ...previous, progress: (event.data.cursor ?? cursor) / RGB_TOTAL }));
      } else {
        const nextCursor = event.data.nextCursor ?? cursor;
        setScan({
          colors: event.data.colors ?? [], nextCursor, end: Boolean(event.data.end),
          searching: false, progress: nextCursor / RGB_TOTAL,
        });
        setCursors(previous => {
          if (previous[page + 1] === nextCursor) return previous;
          return [...previous.slice(0, page + 1), nextCursor];
        });
      }
    };
    worker.onerror = () => {
      setScan({ ...EMPTY_SCAN, searching: false, end: true });
      setStatus("Color search unavailable. Reset filters and try again.");
    };
    worker.postMessage({ id: 1, anchor, cursor, order: rgbOrder, filters });
    return () => worker.terminate();
    // Cursor values are page bookmarks; changing them after a completed search
    // must not restart the current search.
  }, [mode, filtered, filters, rgbOrder, anchor, page]);

  const cards = useMemo(() => {
    if (mode === "named") return named.slice(page * RGB_PAGE_SIZE, (page + 1) * RGB_PAGE_SIZE);
    if (filtered) return scan.colors.map(hex => ({ name: "", hex }));
    return Array.from({ length: Math.min(RGB_PAGE_SIZE, RGB_TOTAL - page * RGB_PAGE_SIZE) },
      (_, i) => ({ name: "", hex: colorAt(page * RGB_PAGE_SIZE + i, rgbOrder) }));
  }, [mode, named, page, filtered, scan.colors, rgbOrder]);

  const jumpToHex = (hex: string) => {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    setMode("rgb");
    clearFilters();
    const index = colorIndex(normalized, rgbOrder);
    setPage(Math.floor(index / RGB_PAGE_SIZE));
    setSelectedHex(normalized);
    select(normalized);
    setStatus("Exact RGB color located");
  };
  const find = () => {
    const hex = normalizeHex(query);
    if (hex) jumpToHex(hex);
    else {
      setMode("named");
      setPage(0);
      setStatus(query.trim() ? "Showing matching named colors" : "");
    }
  };
  const choose = (hex: string) => {
    setSelectedHex(hex);
    select(hex);
  };
  const copy = async (value: string, label: string) => {
    setStatus(await copyColorText(value) ? label + " copied" : "Clipboard unavailable");
  };
  const totalNamedPages = Math.max(1, Math.ceil(named.length / RGB_PAGE_SIZE));
  const nextDisabled = mode === "named" ? page >= totalNamedPages - 1
    : filtered ? scan.searching || scan.end || scan.colors.length === 0
      : page >= LAST_PAGE;
  const previousDisabled = page === 0 || scan.searching && filtered && mode === "rgb";
  const stats = hexStats(selectedHex);
  const rgb = [1, 3, 5].map(i => parseInt(selectedHex.slice(i, i + 2), 16));
  const hexName = NAMED_COLORS.find(([,hex]) => hex === selectedHex)?.[0];

  return (
    <section className="pfx-c-explore pfx-v2__page" aria-label="Explore colors">
      <div className="pfx-v2__page-heading">
        <div><span className="pfx-v2__eyebrow">COLOR DISCOVERY / 16.7 MILLION SHADES</span>
          <h1>Explore color.</h1>
          <p>Browse the entire sRGB space, filter by hue and character, or find any exact HEX.</p></div>
        <div className="pfx-v2__mode" role="group" aria-label="Explore mode">
          <button type="button" className={mode === "named" ? "pfx-is-active" : ""}
            aria-pressed={mode === "named"} onClick={() => { setMode("named"); setPage(0); }}>Named colors</button>
          <button type="button" className={mode === "rgb" ? "pfx-is-active" : ""}
            aria-pressed={mode === "rgb"} onClick={() => { setMode("rgb"); setPage(0); }}>All RGB</button>
        </div>
      </div>

      <div className="pfx-v2__toolbar">
        <form className="pfx-v2__search" onSubmit={event => { event.preventDefault(); find(); }}>
          <label htmlFor="pfx-explore-search">Search by name or exact HEX</label>
          <input id="pfx-explore-search" type="search" value={query}
            placeholder="Color name or #RRGGBB" onChange={event => { setQuery(event.target.value); if (mode === "named") setPage(0); }} />
          <button type="submit">Find</button>
        </form>
        <div className="pfx-explore__order">
          <label htmlFor="pfx-explore-sort">Sort colors</label>
          {mode === "named" ? <select id="pfx-explore-sort" aria-label="Sort named colors" value={namedOrder}
            onChange={event => { setNamedOrder(event.target.value as typeof namedOrder); setPage(0); }}>
            <option value="name">Name A–Z</option><option value="hue">Hue</option>
            <option value="lightness">Lightness</option><option value="saturation">Saturation</option>
          </select> : <select id="pfx-explore-sort" aria-label="RGB browsing order" value={rgbOrder}
            onChange={event => switchOrder(event.target.value as RgbOrder)}>
            <option value="spectrum">Color neighborhoods</option>
            <option value="hex">HEX ascending</option><option value="reverse">HEX descending</option>
          </select>}
        </div>
      </div>

      <div className="pfx-explore__filters">
        <div className="pfx-explore__filters-title"><strong>Find your range</strong>
          <button type="button" onClick={clearFilters} disabled={!filtered}>Reset filters</button></div>
        <div className="pfx-explore__families" role="group" aria-label="Filter by color family">
          {FAMILIES.map(family => <button type="button" key={family}
            aria-pressed={filters.family === family}
            onClick={() => setFamilyOrFilter({ family })}>
            {family !== "all" && <span style={{ background: FAMILY_ANCHORS[family] }}/>}
            {family === "all" ? "All colors" : family[0].toUpperCase() + family.slice(1)}
          </button>)}
        </div>
        <div className="pfx-explore__advanced">
          <label className="pfx-explore__temperature">Temperature
            <select aria-label="Color temperature" value={filters.temperature}
              onChange={event => setFamilyOrFilter({ temperature: event.target.value as ExploreFilters["temperature"] })}>
              <option value="any">All temperatures</option><option value="warm">Warm</option>
              <option value="cool">Cool</option><option value="neutral">Neutral</option>
            </select>
          </label>
          <div className="pfx-explore__range">
            <strong>Lightness (HSL)</strong>
            <label>Min <span>{filters.minLightness}%</span>
              <input type="range" min="0" max="100" value={filters.minLightness}
                aria-label="Minimum lightness filter"
                onChange={event => setFamilyOrFilter({ minLightness: Math.min(filters.maxLightness, Number(event.target.value)) })}/></label>
            <label>Max <span>{filters.maxLightness}%</span>
              <input type="range" min="0" max="100" value={filters.maxLightness}
                aria-label="Maximum lightness filter"
                onChange={event => setFamilyOrFilter({ maxLightness: Math.max(filters.minLightness, Number(event.target.value)) })}/></label>
          </div>
          <div className="pfx-explore__range">
            <strong>Saturation (HSL)</strong>
            <label>Min <span>{filters.minSaturation}%</span>
              <input type="range" min="0" max="100" value={filters.minSaturation}
                aria-label="Minimum saturation filter"
                onChange={event => setFamilyOrFilter({ minSaturation: Math.min(filters.maxSaturation, Number(event.target.value)) })}/></label>
            <label>Max <span>{filters.maxSaturation}%</span>
              <input type="range" min="0" max="100" value={filters.maxSaturation}
                aria-label="Maximum saturation filter"
                onChange={event => setFamilyOrFilter({ maxSaturation: Math.max(filters.minSaturation, Number(event.target.value)) })}/></label>
          </div>
        </div>
      </div>

      <div className="pfx-explore__results">
        <div className="pfx-explore__listing">
          <div className="pfx-explore__summary">
            <div><strong>{mode === "named" ? intFormat.format(named.length) + " CSS named colors" :
              intFormat.format(RGB_TOTAL) + " addressable RGB colors"}</strong>
              <span>{mode === "rgb" && filtered ?
                scan.searching ? "Scanning color space · " + (scan.progress * 100).toFixed(1) + "%" :
                  scan.end ? "End of matches reached" : "Filtered across all RGB colors" :
                mode === "rgb" ? "Complete, exact 24-bit catalog" : "Including CSS spelling aliases"}</span>
            </div>
            <div className="pfx-v2__pager">
              <button type="button" disabled={previousDisabled} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</button>
              {mode === "rgb" && !filtered ? <label>Page
                <input type="number" min={1} max={LAST_PAGE + 1} value={page + 1}
                  aria-label="RGB page number"
                  onChange={event => { const value=Number(event.target.value); if(Number.isInteger(value)&&value>=1&&value<=LAST_PAGE+1)setPage(value-1);}}/>
                <span> / {intFormat.format(LAST_PAGE+1)}</span></label> :
                <span>Page {intFormat.format(page + 1)}{mode === "named" ? " / " + totalNamedPages : ""}</span>}
              <button type="button" disabled={nextDisabled} onClick={() => setPage(p => p+1)}>Next</button>
            </div>
          </div>
          <div className="pfx-v2__swatches" aria-label="Color swatches">
            {cards.map(({ name, hex }) => <article key={name + hex}
              className={"pfx-v2__swatch" + (selectedHex === hex ? " pfx-is-selected" : "")}>
              <button className="pfx-v2__swatch-color" type="button" style={{ backgroundColor: hex }}
                onClick={() => choose(hex)} aria-label={"Select " + (name || hex)}>
                <span className="pfx-v2__swatch-marker">{selectedHex === hex ? "✓" : ""}</span></button>
              <div className="pfx-v2__swatch-info">
                {name && <strong title={name}>{name}</strong>}
                <span>{hex.toUpperCase()}</span>
              </div>
              <div className="pfx-v2__swatch-actions">
                <button type="button" onClick={() => void copy(hex.toUpperCase(), "HEX")}>Copy</button>
                <button type="button" aria-label={(favorites.includes(hex) ? "Remove favorite " : "Save favorite ") + hex}
                  aria-pressed={favorites.includes(hex)} onClick={() => toggleFavorite(hex)}>
                  {favorites.includes(hex) ? "★" : "☆"}</button>
              </div>
            </article>)}
          </div>
          {cards.length === 0 && <div className="pfx-v2__empty" role="status">
            {scan.searching && mode === "rgb" ? "Searching the RGB space for matching colors…" :
              "No colors found for these filters. Adjust the range or reset filters."}
          </div>}
        </div>
        <aside className="pfx-explore__inspector" aria-label="Selected color details">
          <div className="pfx-explore__inspector-head"><span>SELECTED COLOR</span>
            <button type="button" aria-label={favorites.includes(selectedHex) ? "Remove selected favorite" : "Save selected favorite"}
              aria-pressed={favorites.includes(selectedHex)} onClick={() => toggleFavorite(selectedHex)}>
              {favorites.includes(selectedHex) ? "★ Saved" : "☆ Save"}</button></div>
          <div className="pfx-explore__preview" style={{ background: selectedHex }}/>
          <div className="pfx-explore__details">
            {hexName && <span className="pfx-explore__color-name">{hexName}</span>}
            <strong>{selectedHex.toUpperCase()}</strong>
            <p>{stats.family[0].toUpperCase() + stats.family.slice(1)} · {Math.round(stats.lightness)}% lightness · {Math.round(stats.saturation)}% saturation</p>
          </div>
          <div className="pfx-explore__values">
            <div><span>HEX</span><code>{selectedHex.toUpperCase()}</code>
              <button type="button" onClick={() => void copy(selectedHex.toUpperCase(), "HEX")}>Copy</button></div>
            <div><span>RGB</span><code>{rgb.join(", ")}</code>
              <button type="button" onClick={() => void copy("rgb(" + rgb.join(" ") + ")", "RGB")}>Copy</button></div>
            <div><span>HSL</span><code>{Math.round(stats.hue)}°, {Math.round(stats.saturation)}%, {Math.round(stats.lightness)}%</code>
              <button type="button" onClick={() => void copy("hsl(" + Math.round(stats.hue) + " " + Number(stats.saturation.toFixed(2)) + "% " + Number(stats.lightness.toFixed(2)) + "%)", "HSL")}>Copy</button></div>
          </div>
          <div className="pfx-explore__inspector-actions">
            <button type="button" onClick={() => openPicker(selectedHex)}>Open Picker</button>
            <button type="button" onClick={() => openTones(selectedHex)}>Create Tones →</button>
          </div>
          <div className="pfx-explore__compare">
            <div><strong>Color comparison</strong>
              <button type="button" onClick={() => setComparison(selectedHex)}>Set reference</button></div>
            {comparison ? <div className="pfx-explore__compare-result">
              <span style={{ background: comparison }} title={comparison}/>
              <span style={{ background: selectedHex }} title={selectedHex}/>
              <output>{pairContrast(comparison, selectedHex).toFixed(2)}:1 contrast</output>
            </div> : <p>Select a reference, then choose another color to compare.</p>}
          </div>
          <div className="pfx-explore__similar">
            <strong>Nearby shades</strong>
            <div>{similarColors(selectedHex).map(hex => <button key={hex} type="button"
              aria-label={"Select nearby " + hex} style={{ background: hex }}
              title={hex.toUpperCase()} onClick={() => choose(hex)}/>)}</div>
          </div>
        </aside>
      </div>
      <p className="pfx-explore__status" role="status" aria-live="polite">{status}</p>
    </section>
  );
}
