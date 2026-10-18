import { useEffect, useMemo, useState } from "react";
import type { ColorInput } from "@pfx/color-core";
import { copyColorText } from "./clipboard";
import {
  INITIAL_CSS_COLORS, LIBRARIES, TOTAL_COLOR_ENTRIES,
  filterColorRecords, loadColorCatalog,
  type CatalogId, type ColorRecord, type ExploreSource,
} from "./explore-catalog";

type Props = {
  activeHex: string;
  select: (hex: ColorInput) => void;
};

const PAGE_SIZE = 96;
const number = (value: number) => value.toLocaleString("en-US");
const preview = (colors: readonly string[]) => colors.map((hex, i) =>
  <span key={i} style={{ backgroundColor: hex }} aria-hidden="true" />);

export function Explore({ activeHex, select }: Props) {
  const [source, setSource] = useState<ExploreSource>("overview");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [data, setData] = useState<Partial<Record<CatalogId, ColorRecord[]>>>(
    { css: INITIAL_CSS_COLORS },
  );
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState("");
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState("");

  const pickSource = (next: ExploreSource) => {
    setSource(next);
    setQuery("");
    setGroup("all");
    setLimit(PAGE_SIZE);
    setStatus("");
    setFailure("");
  };

  useEffect(() => {
    if (source === "overview" || source === "css") {
      setLoading(false);
      return;
    }
    const need = (source === "all"
      ? LIBRARIES.map(library => library.id)
      : [source]).filter((id): id is Exclude<CatalogId, "css"> =>
        id !== "css" && !data[id]);
    if (!need.length) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setFailure("");
    void Promise.all(need.map(async id => [id, await loadColorCatalog(id)] as const))
      .then(loaded => {
        if (cancelled) return;
        setData(previous => {
          const next = { ...previous };
          for (const [id, colors] of loaded) next[id] = colors;
          return next;
        });
        setLoading(false);
      })
      .catch(error => {
        if (!cancelled) {
          setFailure(error instanceof Error ? error.message : "Library load failed");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [source, retry, data]);

  const colors = useMemo(() => {
    if (source === "overview") return [] as ColorRecord[];
    if (source === "all") return LIBRARIES.flatMap(library => data[library.id] ?? []);
    return data[source] ?? [];
  }, [source, data]);
  const ready = source !== "overview" &&
    (source === "all" ? LIBRARIES.every(library => Boolean(data[library.id])) : Boolean(data[source]));
  const groups = useMemo(() => source === "overview" || source === "all"
    ? [] : [...new Set(colors.map(color => color[2]))].sort((a, b) => a.localeCompare(b)),
  [source, colors]);
  const matching = useMemo(() => filterColorRecords(colors, query, group), [colors, query, group]);
  const visible = matching.slice(0, limit);
  const current = LIBRARIES.find(item => item.id === source);
  const copy = async (hex: string) => {
    setStatus(await copyColorText(hex.toUpperCase())
      ? "Copied " + hex.toUpperCase() : "Clipboard unavailable");
  };

  return (
    <section className="pfx-explore pfx-v2__page" aria-label="Explore color libraries">
      <div className="pfx-explore__layout">
        <header className="pfx-explore__header">
          <div className="pfx-explore__heading">
            <span className="pfx-explore__eyebrow">PFx / COLOR LIBRARY</span>
            <h1>Explore colors</h1>
            <p>{number(TOTAL_COLOR_ENTRIES)} color entries from 6 libraries, ready to explore.</p>
          </div>
          <a className="pfx-explore__source" href="./palettes/ATTRIBUTION.txt"
             target="_blank" rel="noreferrer">Sources & licenses <span aria-hidden="true">↗</span></a>
        </header>

        <div className="pfx-explore__navigation" role="group" aria-label="Color libraries">
          <button type="button" className={source === "overview" ? "is-active" : ""}
            aria-pressed={source === "overview"} onClick={() => pickSource("overview")}>Libraries</button>
          <button type="button" className={source === "all" ? "is-active" : ""}
            aria-pressed={source === "all"} onClick={() => pickSource("all")}>All colors</button>
          {LIBRARIES.map(library => <button key={library.id} type="button"
            className={source === library.id ? "is-active" : ""}
            aria-pressed={source === library.id} onClick={() => pickSource(library.id)}>{library.label}</button>)}
        </div>

        {source === "overview" ? (
          <div className="pfx-explore__viewport" role="region" aria-label="Available color libraries" tabIndex={0}>
            <div className="pfx-explore__intro">
              <span>CURATED SOURCES</span>
              <span>Select a collection to browse its colors.</span>
            </div>
            <div className="pfx-explore__libraries">
              {LIBRARIES.map(library => (
                <button type="button" key={library.id} className="pfx-explore__library"
                  onClick={() => pickSource(library.id)}
                  aria-label={"Browse " + library.label + " library"}>
                  <span className="pfx-explore__library-preview">{preview(library.preview)}</span>
                  <span className="pfx-explore__library-body">
                    <span className="pfx-explore__library-title">{library.label}
                      <span aria-hidden="true">↗</span></span>
                    <span className="pfx-explore__library-detail">{library.subtitle}</span>
                    <strong>{number(library.total)} colors</strong>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="pfx-explore__collection-head">
              <div>
                <h2>{current?.label ?? "All colors"}</h2>
                <p>{current?.subtitle ?? "Search every library in one place."}</p>
              </div>
              {current && <a href={current.url} target="_blank" rel="noopener noreferrer">
                Original project <span aria-hidden="true">↗</span></a>}
            </div>
            <div className="pfx-explore__toolbar">
              <label className="pfx-explore__search">
                <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none"
                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="10.7" cy="10.7" r="6.6" /><path d="m16 16 5 5" />
                </svg>
                <input type="search" value={query}
                  onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE); }}
                  aria-label="Search colors" placeholder="Search by name, HEX or collection"
                  autoComplete="off" spellCheck={false} />
              </label>
              {groups.length > 1 && (
                <select className="pfx-explore__group" aria-label="Filter color group"
                  value={group} onChange={event => { setGroup(event.target.value); setLimit(PAGE_SIZE); }}>
                  <option value="all">All groups</option>
                  {groups.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              )}
              <span className="pfx-explore__count" aria-live="polite">
                {loading && !ready ? "Loading colors…" : number(matching.length) + " results"}
              </span>
              <span className="pfx-explore__feedback" role="status" aria-live="polite">{status}</span>
            </div>
            <div className="pfx-explore__viewport" role="region" aria-label="Color results" tabIndex={0}>
              {failure ? (
                <div className="pfx-explore__empty" role="alert">
                  <p>{failure}</p>
                  <button type="button" onClick={() => { setFailure(""); setRetry(value => value + 1); }}>
                    Retry loading
                  </button>
                </div>
              ) : loading && !ready ? (
                <p className="pfx-explore__empty" role="status">Loading color library…</p>
              ) : matching.length === 0 ? (
                <p className="pfx-explore__empty">No matching colors.</p>
              ) : (
                <>
                  <div className="pfx-explore__list">
                    {visible.map(([name, hex, family], i) => {
                      const selected = activeHex.toLowerCase() === hex.toLowerCase();
                      return (
                        <article className={"pfx-explore__chip" + (selected ? " is-active" : "")}
                          key={source + ":" + name + ":" + i}>
                          <button className="pfx-explore__select" type="button" aria-pressed={selected}
                            title={"Use " + name + " " + hex.toUpperCase()}
                            aria-label={"Select " + name + " " + hex.toUpperCase()}
                            onClick={() => { select(hex); setStatus(""); }}>
                            <span className="pfx-explore__swatch" style={{ backgroundColor: hex }}
                              aria-hidden="true" />
                            <span className="pfx-explore__name">{name}</span>
                          </button>
                          <div className="pfx-explore__chip-meta">
                            <span title={family}>{family}</span>
                            <button type="button" className="pfx-explore__copy"
                              title={"Copy " + hex.toUpperCase()}
                              aria-label={"Copy " + name + " " + hex.toUpperCase()}
                              onClick={() => void copy(hex)}>{hex.toUpperCase()}</button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {limit < matching.length && (
                    <button className="pfx-explore__more" type="button"
                      onClick={() => setLimit(previous => previous + PAGE_SIZE)}>
                      Load more · {number(matching.length - visible.length)} remaining
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
