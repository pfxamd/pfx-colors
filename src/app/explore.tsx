import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { ColorInput } from "@pfx/color-core";
import { copyColorText } from "./clipboard";
import { relatedShades } from "./explore-atlas";
import {
  INITIAL_CSS_COLORS, LIBRARIES, TOTAL_COLOR_ENTRIES, loadColorCatalog,
  type CatalogId, type ColorRecord,
} from "./explore-catalog";
import {
  collectColorGroups, colorDescription, searchExploreColors,
  type ExploreView, type HueFamily,
} from "./explore-discovery";

type Source = CatalogId | "all" | "favorites";
type Props = {
  activeHex: string;
  select: (hex: ColorInput) => void;
  favorites: readonly string[];
  toggleFavorite: (hex: string) => void;
  saveSet: (name: string, hexes: readonly string[]) => void;
};

const PAGE_SIZE = 96;
const number = (value: number) => value.toLocaleString("en-US");
const FAMILIES: readonly [HueFamily, string][] = [
  ["all", "All hues"], ["red", "Red"], ["orange", "Orange"],
  ["yellow", "Yellow"], ["green", "Green"], ["cyan", "Cyan"],
  ["blue", "Blue"], ["purple", "Purple"], ["pink", "Pink"], ["neutral", "Neutral"],
];
const GROUP_PREVIEW = 5;

function ShadeStrip({ colors }: { colors: readonly ColorRecord[] }) {
  return <span className="pfx-explore__strip" aria-hidden="true">
    {colors.map(([name, hex], index) =>
      <span key={name + index} style={{ backgroundColor: hex }} />)}
  </span>;
}

export function Explore({ activeHex, select, favorites, toggleFavorite, saveSet }: Props) {
  const [source, setSource] = useState<Source>("all");
  const [expanded, setExpanded] = useState<CatalogId | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [group, setGroup] = useState("all");
  const [view, setView] = useState<ExploreView>("colors");
  const [family, setFamily] = useState<HueFamily>("all");
  const [lightMin, setLightMin] = useState(0);
  const [lightMax, setLightMax] = useState(100);
  const [chromaMin, setChromaMin] = useState(0);
  const [nearest, setNearest] = useState(false);
  const [reference, setReference] = useState(activeHex);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [data, setData] = useState<Partial<Record<CatalogId, ColorRecord[]>>>({ css: INITIAL_CSS_COLORS });
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState("");
  const [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState<ColorRecord | null>(null);
  const [tray, setTray] = useState<string[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!detail && !drawerOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setDetail(null); setDrawerOpen(false); }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [detail, drawerOpen]);

  useEffect(() => {
    if (source === "css" || source === "favorites") { setLoading(false); return; }
    const needed = (source === "all" ? LIBRARIES.map(item => item.id) : [source])
      .filter((id): id is Exclude<CatalogId, "css"> => id !== "css" && !data[id]);
    if (needed.length === 0) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setFailure("");
    void Promise.all(needed.map(async id => [id, await loadColorCatalog(id)] as const))
      .then(loaded => {
        if (cancelled) return;
        setData(previous => {
          const next = { ...previous };
          for (const [id, entries] of loaded) next[id] = entries;
          return next;
        });
        setLoading(false);
      })
      .catch(error => {
        if (cancelled) return;
        setFailure(error instanceof Error ? error.message : "Library unavailable");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [source, retry, data]);

  const ready = source === "favorites" || source === "css" ||
    (source === "all" ? LIBRARIES.every(item => Boolean(data[item.id])) : Boolean(data[source]));
  const sourceColors = useMemo<ColorRecord[]>(() => {
    if (source === "favorites") return favorites.map(hex => [hex, hex, "Saved colors"]);
    if (source === "all") return LIBRARIES.flatMap(item => data[item.id] ?? []);
    return data[source] ?? [];
  }, [source, favorites, data]);
  const groups = useMemo(() =>
    [...new Set(sourceColors.map(color => color[2]))].sort((a, b) => a.localeCompare(b)),
  [sourceColors]);
  const matching = useMemo(() =>
    searchExploreColors(sourceColors, {
      query: deferredQuery, group, family, lightMin, lightMax, chromaMin,
      nearest, reference: reference.trim().toLowerCase(),
    }), [sourceColors, deferredQuery, group, family, lightMin, lightMax, chromaMin, nearest, reference]);
  const swatches = matching.slice(0, limit);
  const grouped = useMemo(() => collectColorGroups(matching, view === "palettes" ? "palettes" : "scales"),
    [matching, view]);
  const shownGroups = grouped.slice(0, Math.ceil(limit / 6));
  const activeLibrary = LIBRARIES.find(item => item.id === source);
  const validReference = /^#[a-f0-9]{6}$/i.test(reference.trim());
  const title = source === "all" ? "All colors" : source === "favorites" ? "My favorites" : activeLibrary?.label ?? "Explore";
  const subtitle = source === "all" ? "A unified catalog of open color collections"
    : source === "favorites" ? "Colors saved to your workspace"
    : activeLibrary?.subtitle ?? "";
  const hasFilters = Boolean(query || group !== "all" || family !== "all" ||
    lightMin > 0 || lightMax < 100 || chromaMin > 0 || nearest);
  const details = detail ? colorDescription(detail[1]) : null;
  const related = detail ? relatedShades(detail[1]).slice(0, 8) : [];

  function choose(next: Source, nextGroup = "all") {
    setSource(next);
    setQuery("");
    setGroup(nextGroup);
    setLimit(PAGE_SIZE);
    setDrawerOpen(false);
    setFailure("");
    setStatus("");
  }
  function resetFilters() {
    setQuery("");
    setGroup("all");
    setFamily("all");
    setLightMin(0);
    setLightMax(100);
    setChromaMin(0);
    setNearest(false);
    setLimit(PAGE_SIZE);
  }
  async function copy(value: string) {
    setStatus(await copyColorText(value.toUpperCase()) ? "Copied " + value.toUpperCase() : "Clipboard unavailable");
  }
  function addToTray(hex: string) {
    setTray(current => current.includes(hex.toLowerCase()) ? current :
      [...current, hex.toLowerCase()].slice(0, 12));
    setStatus("Added to your palette");
  }
  function savePalette() {
    if (tray.length === 0) return;
    saveSet("Explore palette", tray);
    setTray([]);
    setStatus("Palette saved to Collections");
  }
  function paletteCard(groupName: string, colors: readonly ColorRecord[]) {
    return <article className="pfx-explore__palette-card" key={groupName}>
      <ShadeStrip colors={colors} />
      <div className="pfx-explore__palette-caption">
        <div><strong title={groupName}>{groupName}</strong><small>{colors.length} colors</small></div>
        <button type="button" title={"Add " + groupName + " to palette"}
          aria-label={"Add " + groupName + " to palette"}
          onClick={() => { setTray(previous =>
            [...new Set([...previous, ...colors.map(color => color[1])])].slice(0, 12));
            setStatus("Added palette shades");
          }}>Add +</button>
      </div>
      <div className="pfx-explore__palette-shades">
        {colors.map(([name, hex], index) =>
          <button type="button" key={name + index} title={name + " — " + hex.toUpperCase()}
            aria-label={"Inspect " + name + " " + hex}
            style={{ backgroundColor: hex }}
            onClick={() => setDetail([name, hex, groupName])} />)}
      </div>
    </article>;
  }

  return <section className="pfx-explore pfx-v2__page" aria-label="Explore color libraries">
    <div className="pfx-explore__shell">
      {drawerOpen && <button className="pfx-explore__backdrop" type="button" aria-label="Close filters"
        onClick={() => setDrawerOpen(false)} />}
      <aside className={"pfx-explore__sidebar" + (drawerOpen ? " is-open" : "")}
        aria-label="Explore navigation and filters">
        <div className="pfx-explore__sidebar-top">
          <div><span className="pfx-explore__eyebrow">PFx / DISCOVER</span>
            <strong>Color libraries</strong><small>{number(TOTAL_COLOR_ENTRIES)} color entries</small></div>
          <button className="pfx-explore__close" aria-label="Close sidebar" type="button"
            onClick={() => setDrawerOpen(false)}>×</button>
        </div>
        <div className="pfx-explore__sidebar-scroll">
          <label className="pfx-explore__search">
            <span aria-hidden="true">⌕</span>
            <input type="search" aria-label="Search colors" placeholder="Name, HEX, collection..."
              value={query} onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} />
          </label>
          <p className="pfx-explore__section-label">BROWSE</p>
          <button type="button" className={"pfx-explore__source-button" + (source === "all" ? " is-active" : "")}
            aria-pressed={source === "all"} onClick={() => choose("all")}>
            <span className="pfx-explore__source-mark">◎</span><span>All colors</span>
            <small>{number(TOTAL_COLOR_ENTRIES)}</small>
          </button>
          <button type="button" className={"pfx-explore__source-button" + (source === "favorites" ? " is-active" : "")}
            aria-pressed={source === "favorites"} onClick={() => choose("favorites")}>
            <span className="pfx-explore__source-mark">♡</span><span>My favorites</span>
            <small>{favorites.length}</small>
          </button>
          <p className="pfx-explore__section-label">LIBRARIES</p>
          <div className="pfx-explore__sidebar-libraries">
            {LIBRARIES.map(library => {
              const libraryGroups = data[library.id] ?
                [...new Set(data[library.id]?.map(color => color[2]))] : [];
              const expandedHere = expanded === library.id;
              return <div key={library.id} className="pfx-explore__source-entry">
                <div className="pfx-explore__source-row">
                  <button type="button"
                    className={"pfx-explore__source-button" + (source === library.id ? " is-active" : "")}
                    aria-pressed={source === library.id} onClick={() => {
                      choose(library.id);
                      setExpanded(library.id);
                    }}>
                    <span className="pfx-explore__source-mark" style={{ background: library.preview[2] }} />
                    <span>{library.label}</span><small>{number(library.total)}</small>
                  </button>
                  <button type="button" className="pfx-explore__expand"
                    aria-label={(expandedHere ? "Collapse " : "Expand ") + library.label}
                    aria-expanded={expandedHere}
                    onClick={() => {
                      setExpanded(expandedHere ? null : library.id);
                      if (!expandedHere) { choose(library.id); setExpanded(library.id); }
                    }}>{expandedHere ? "⌄" : "›"}</button>
                </div>
                {expandedHere && <div className="pfx-explore__subgroups">
                  <button type="button" className={source === library.id && group === "all" ? "is-active" : ""}
                    onClick={() => choose(library.id)}>All shades</button>
                  {libraryGroups.length > 1 && libraryGroups.map(name =>
                    <button type="button" key={name}
                      className={source === library.id && group === name ? "is-active" : ""}
                      onClick={() => choose(library.id, name)}>{name}</button>)}
                  {libraryGroups.length < 2 && <small>{data[library.id] ? "Individual color collection" : "Loading groups…"}</small>}
                </div>}
              </div>;
            })}
          </div>
          <div className="pfx-explore__filter-head">
            <p className="pfx-explore__section-label">FILTERS</p>
            {hasFilters && <button type="button" onClick={resetFilters}>Reset</button>}
          </div>
          <label className="pfx-explore__filter-field">Hue family
            <select aria-label="Hue family" value={family}
              onChange={event => { setFamily(event.target.value as HueFamily); setLimit(PAGE_SIZE); }}>
              {FAMILIES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="pfx-explore__filter-field">
            <span>Minimum lightness <b>{lightMin}%</b></span>
            <input type="range" aria-label="Minimum lightness" min="0" max="100" step="5" value={lightMin}
              onChange={event => { const value = Number(event.target.value);
                setLightMin(value); if (value > lightMax) setLightMax(value);
                setLimit(PAGE_SIZE); }} />
          </label>
          <label className="pfx-explore__filter-field">
            <span>Maximum lightness <b>{lightMax}%</b></span>
            <input type="range" aria-label="Maximum lightness" min="0" max="100" step="5" value={lightMax}
              onChange={event => { const value = Number(event.target.value);
                setLightMax(value); if (value < lightMin) setLightMin(value);
                setLimit(PAGE_SIZE); }} />
          </label>
          <label className="pfx-explore__filter-field">
            <span>Minimum chroma <b>{chromaMin}</b></span>
            <input type="range" aria-label="Minimum chroma" min="0" max="30" step="2" value={chromaMin}
              onChange={event => { setChromaMin(Number(event.target.value)); setLimit(PAGE_SIZE); }} />
          </label>
          <div className="pfx-explore__similar">
            <label htmlFor="pfx-explore-reference">SIMILARITY SEARCH</label>
            <div><input id="pfx-explore-reference" aria-label="Reference HEX"
              placeholder="#RRGGBB" value={reference}
              onChange={event => setReference(event.target.value)} />
              <button type="button" onClick={() => setReference(activeHex.toUpperCase())}
                title="Use the currently selected color">↙</button></div>
            <button type="button" className={nearest ? "is-active" : ""}
              aria-pressed={nearest} disabled={!validReference}
              onClick={() => { setNearest(value => !value); setLimit(PAGE_SIZE); }}>
              {nearest ? "✓ Nearest colors first" : "Find nearest colors"}
            </button>
          </div>
        </div>
        <a className="pfx-explore__credits" href="./palettes/ATTRIBUTION.txt"
          target="_blank" rel="noreferrer">Sources & licenses <span aria-hidden="true">↗</span></a>
      </aside>

      <div className="pfx-explore__workspace">
        <header className="pfx-explore__workspace-head">
          <div className="pfx-explore__heading">
            <div className="pfx-explore__heading-line">
              <button type="button" className="pfx-explore__mobile-toggle"
                aria-label="Open libraries and filters" aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen(true)}>☰</button>
              <span className="pfx-explore__eyebrow">EXPLORE / COLOR WORKSPACE</span>
            </div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          {activeLibrary && <a className="pfx-explore__source-link" href={activeLibrary.url}
            target="_blank" rel="noopener noreferrer">View source ↗</a>}
        </header>
        <div className="pfx-explore__results-toolbar">
          <span className="pfx-explore__result-count" aria-live="polite">
            {loading && !ready ? "Loading libraries…" : number(matching.length) + " colors"}
            {hasFilters && <small> · filtered</small>}
          </span>
          <div className="pfx-explore__view-switch" role="group" aria-label="View colors as">
            {(["colors", "scales", "palettes"] as const).map(mode =>
              <button type="button" key={mode} className={view === mode ? "is-active" : ""}
                aria-pressed={view === mode} onClick={() => { setView(mode); setLimit(PAGE_SIZE); }}>
                {mode[0].toUpperCase() + mode.slice(1)}</button>)}
          </div>
        </div>
        <div className="pfx-explore__viewport" role="region" aria-label="Color results" tabIndex={0}>
          {failure ? <div className="pfx-explore__empty" role="alert">
            <strong>Could not load this library</strong><p>{failure}</p>
            <button type="button" onClick={() => { setFailure(""); setRetry(value => value + 1); }}>Try again</button>
          </div> : loading && !ready ? <p className="pfx-explore__empty" role="status">Loading color collections…</p>
          : view !== "colors" && grouped.length === 0 ? <div className="pfx-explore__empty">
            <strong>{view === "scales" ? "No color scales in this selection" : "No multi-color palettes in this selection"}</strong>
            <p>{view === "scales" ? "Try Open Color, Radix or Tailwind for complete tonal scales."
              : "Explore D3 Chromatic for categorical and diverging palettes."}</p>
            <button type="button" onClick={() => { choose(view === "scales" ? "open" : "d3"); resetFilters(); }}>
              Open recommended library ↗</button>
          </div> : matching.length === 0 ? <div className="pfx-explore__empty">
            <strong>No matching colors</strong><p>Try another name, hue or range.</p>
            <button type="button" onClick={resetFilters}>Clear filters</button>
          </div> : view === "colors" ? <>
            <div className="pfx-explore__swatch-grid">
              {swatches.map(([name, hex, origin], i) =>
                <article className="pfx-explore__tile" key={source + name + i}>
                  <button type="button" className="pfx-explore__tile-color"
                    style={{ backgroundColor: hex }}
                    title={"Select " + name + " " + hex.toUpperCase()}
                    aria-label={"Select " + name + " " + hex.toUpperCase()}
                    onClick={() => { select(hex); setStatus(""); }}>
                    {activeHex.toLowerCase() === hex.toLowerCase() &&
                      <span className="pfx-explore__selected" aria-hidden="true">✓</span>}
                  </button>
                  <div className="pfx-explore__tile-info">
                    <button type="button" className="pfx-explore__tile-name"
                      title={"Inspect " + name} onClick={() => setDetail([name, hex, origin])}>{name}</button>
                    <span>{origin}</span>
                    <button type="button" className="pfx-explore__tile-hex"
                      aria-label={"Copy " + name + " " + hex.toUpperCase()}
                      title={"Copy " + hex.toUpperCase()}
                      onClick={() => void copy(hex)}>{hex.toUpperCase()} ↗</button>
                  </div>
                </article>)}
            </div>
            {swatches.length < matching.length && <button type="button" className="pfx-explore__load-more"
              onClick={() => setLimit(current => current + PAGE_SIZE)}>
              Load more · {number(matching.length - swatches.length)} remaining
            </button>}
          </> : <>
            <div className="pfx-explore__palette-grid">
              {shownGroups.map(item => paletteCard(item.name, item.colors))}
            </div>
            {shownGroups.length < grouped.length && <button type="button" className="pfx-explore__load-more"
              onClick={() => setLimit(current => current + PAGE_SIZE)}>Load more collections</button>}
          </>}
        </div>
        {tray.length > 0 && <div className="pfx-explore__tray" role="region" aria-label="Your palette">
          <div className="pfx-explore__tray-colors">
            {tray.map(hex => <button key={hex} type="button" style={{ backgroundColor: hex }}
              aria-label={"Remove " + hex + " from palette"} title={"Remove " + hex}
              onClick={() => setTray(current => current.filter(value => value !== hex))} />)}
          </div>
          <small>{tray.length}/12</small>
          <button type="button" onClick={savePalette}>Save palette</button>
          <button type="button" onClick={() => setTray([])} aria-label="Clear palette">×</button>
        </div>}
        <p className="pfx-explore__notice" role="status" aria-live="polite">{status}</p>
      </div>
    </div>

    {detail && details && <div className="pfx-explore__modal-backdrop"
      onMouseDown={event => { if (event.target === event.currentTarget) setDetail(null); }}>
      <section className="pfx-explore__detail" role="dialog" aria-modal="true"
        aria-label={"Color details for " + detail[0]}>
        <button type="button" className="pfx-explore__detail-close" aria-label="Close color details"
          onClick={() => setDetail(null)}>×</button>
        <div className="pfx-explore__detail-sample" style={{ backgroundColor: detail[1] }}>
          <span>COLOR / STUDY</span>
          <strong style={{ color: "#ffffff", textShadow: "0 1px 12px #0007" }}>Aa</strong>
          <span>{detail[1].toUpperCase()}</span>
        </div>
        <div className="pfx-explore__detail-body">
          <div><span className="pfx-explore__eyebrow">COLOR DETAIL</span>
            <h2>{detail[0]}</h2><p>{detail[2]}</p></div>
          <dl>
            {[["HEX", detail[1].toUpperCase()], ["RGB", details.rgb],
              ["HSL", details.hsl], ["OKLCH", details.oklch]].map(([key, value]) =>
              <div key={key}><dt>{key}</dt><dd>{value}</dd>
                <button type="button" aria-label={"Copy " + key}
                  onClick={() => void copy(value)}>Copy</button></div>)}
          </dl>
          <div className="pfx-explore__detail-actions">
            <button type="button" onClick={() => { select(detail[1]); setDetail(null); }}>Use color</button>
            <button type="button" onClick={() => toggleFavorite(detail[1])}>
              {favorites.includes(detail[1].toLowerCase()) ? "♥ Saved" : "♡ Favorite"}</button>
            <button type="button" onClick={() => addToTray(detail[1])}>+ Palette</button>
          </div>
          <span className="pfx-explore__related-heading">RELATED SHADES</span>
          <div className="pfx-explore__related">
            {related.map(hex => <button key={hex} type="button" style={{ backgroundColor: hex }}
              title={"Inspect related shade " + hex.toUpperCase()}
              aria-label={"Inspect related shade " + hex.toUpperCase()}
              onClick={() => setDetail([hex.toUpperCase(), hex, "Similar shade"])} />)}
          </div>
          <p className="pfx-explore__detail-feedback" role="status">{status}</p>
        </div>
      </section>
    </div>}
  </section>;
}
