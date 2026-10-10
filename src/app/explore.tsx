import { useEffect, useMemo, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { copyColorText } from "./clipboard";
import { normalizeHex, NAMED_COLORS } from "./color-library";
import { statsFromRgb } from "./explore-model";
import {
  MAX_CHROMA, FAMILIES, atlasChildren, atlasPath, contrastRatio, gamutMappedHex,
  hexToRgb, oklchToRgb, perceptualDistance, relatedShades, rgbToOklch,
  rgbToHex, tileCount, tileHasHex, tileRange, tileRepresentative,
  type AtlasTile,
} from "./explore-atlas";
import "./explore.css";

type Props = {
  activeHex: string;
  select: (hex: string) => void;
  openPicker: (hex: string) => void;
  openTones: (hex: string) => void;
  favorites: readonly string[];
  toggleFavorite: (hex: string) => void;
};
type Sort = "perceptual" | "lightness" | "rgb";
const format = new Intl.NumberFormat("en-US");
const hexUpper = (hex: string) => hex.toUpperCase();
const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

export function Explore({ activeHex, select, openPicker, openTones, favorites, toggleFavorite }: Props) {
  const [selectedHex, setSelectedHex] = useState(activeHex.toLowerCase());
  const [query, setQuery] = useState("");
  const [stack, setStack] = useState<AtlasTile[]>([]);
  const [sort, setSort] = useState<Sort>("perceptual");
  const [background, setBackground] = useState<"white" | "black">("white");
  const [status, setStatus] = useState("");
  const [showNames, setShowNames] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selected = useMemo(() => rgbToOklch(hexToRgb(selectedHex)), [selectedHex]);
  const selectedRgb = useMemo(() => hexToRgb(selectedHex), [selectedHex]);
  const hslStats = statsFromRgb(...selectedRgb);
  const hsl = "hsl(" + Math.round(hslStats.hue) + " " + Math.round(hslStats.saturation) + "% " + Math.round(hslStats.lightness) + "%)";
  const rgbText = "rgb(" + selectedRgb.join(" ") + ")";
  const parent = stack.at(-1) ?? null;
  const tiles = useMemo(() => {
    const children = atlasChildren(parent);
    const average = (tile: AtlasTile) => rgbToHex(tileRepresentative(tile));
    if (sort === "rgb") return children;
    return children.sort((a, b) => {
      const aa = average(a), bb = average(b);
      if (sort === "lightness") return rgbToOklch(hexToRgb(aa)).l - rgbToOklch(hexToRgb(bb)).l;
      return perceptualDistance(aa, selectedHex) - perceptualDistance(bb, selectedHex);
    });
  }, [parent?.depth, parent?.r, parent?.g, parent?.b, selectedHex, sort]);
  const namedResults = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/[\s-]/g, "");
    if (!needle || normalizeHex(query)) return [];
    return NAMED_COLORS.filter(([name, hex]) =>
      name.toLowerCase().replace(/[\s-]/g, "").includes(needle) || hex.includes(needle)
    ).slice(0, 8);
  }, [query]);
  const related = useMemo(() => relatedShades(selectedHex), [selectedHex]);
  const activeName = NAMED_COLORS.find(([, hex]) => hex === selectedHex)?.[0];
  const ratio = contrastRatio(selectedHex, background === "white" ? "#ffffff" : "#000000");

  useEffect(() => setSelectedHex(activeHex.toLowerCase()), [activeHex]);

  const choose = (hex: string) => {
    const normalized = hex.toLowerCase();
    setSelectedHex(normalized);
    select(normalized);
  };
  const updateLch = (l: number, c: number, h: number) => {
    choose(gamutMappedHex({ l: Math.max(0, Math.min(1, l)), c: Math.max(0, Math.min(MAX_CHROMA, c)), h: ((h % 360) + 360) % 360 }));
  };
  const jumpTo = (hex: string) => {
    choose(hex);
    setStack(atlasPath(hex).slice(0, 3));
    setQuery(hex.toUpperCase());
    setShowNames(false);
    setStatus("Exact RGB location opened in the atlas.");
  };
  const search = () => {
    const exact = normalizeHex(query);
    if (exact) { jumpTo(exact); return; }
    const match = namedResults.find(([name]) => name.toLowerCase().replace(/[\s-]/g, "") === query.trim().toLowerCase().replace(/[\s-]/g, ""));
    if (match) { jumpTo(match[1]); return; }
    setShowNames(true);
    setStatus(namedResults.length ? "Choose a matching named color." : "No matching name. Try a HEX code or another color name.");
  };
  const copyText = async (value: string, label: string) => {
    setStatus(await copyColorText(value) ? label + " copied." : "Clipboard unavailable.");
  };
  const copy = (hex: string) => copyText(hex.toUpperCase(), "HEX");
  const save = (hex: string) => toggleFavorite(hex);

  // The depth canvas is perceptual: vertical = OKLCH lightness, horizontal = chroma.
  // Unrepresentable sRGB points remain transparent, making the gamut boundary visible.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = 272, h = 192;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const l = 1 - y / (h - 1);
      for (let x = 0; x < w; x++) {
        const c = x / (w - 1) * MAX_CHROMA;
        const rgb = oklchToRgb({ l, c, h: selected.h });
        const index = (y * w + x) * 4;
        if (rgb) {
          image.data[index] = rgb[0];
          image.data[index + 1] = rgb[1];
          image.data[index + 2] = rgb[2];
          image.data[index + 3] = 255;
        } else image.data[index + 3] = 0;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, [Math.round(selected.h * 10) / 10]);

  const updateFromDepth = (event: PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
    const y = Math.max(0, Math.min(1, (event.clientY - box.top) / box.height));
    updateLch(1 - y, x * MAX_CHROMA, selected.h);
  };
  const updateFromWheel = (event: PointerEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left - box.width / 2;
    const y = event.clientY - box.top - box.height / 2;
    const h = (Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360;
    updateLch(selected.l, selected.c, h);
  };
  const wheelKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" || event.key === "ArrowUp" ? 3 : -3;
    updateLch(selected.l, selected.c, selected.h + delta);
  };
  const currentStage = (parent?.depth ?? 0) / 2 + 1;
  const selectedContained = parent ? tileHasHex(parent, selectedHex) : true;
  const wheelColor = gamutMappedHex({ l: 0.72, c: 0.16, h: selected.h });

  return (
    <section className="pfx-explore pfx-v2__page" aria-label="Explore colors">
      <header className="pfx-explore__hero">
        <div className="pfx-explore__hero-title">
          <span className="pfx-explore__eyebrow"><span className="pfx-explore__pulse" /> COLOR ATLAS / 24-BIT SRGB</span>
          <h1>Explore color<span className="pfx-explore__period">.</span></h1>
          <p>A continuous way to discover color. Start with the spectrum, refine the shade, or reach any exact RGB value.</p>
        </div>
        <div className="pfx-explore__metric">
          <strong>16,777,216</strong>
          <span>EXACT RGB COLORS</span>
          <small>Generated as you explore. Never stored as a catalog.</small>
        </div>
      </header>

      <div className="pfx-explore__searchbar">
        <form className="pfx-explore__searchform" onSubmit={event => { event.preventDefault(); search(); }}>
          <label htmlFor="pfx-color-search"><span className="pfx-explore__sr-only">Search a named color or exact HEX</span></label>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.4" stroke="currentColor" strokeWidth="1.7"/><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.7"/></svg>
          <input id="pfx-color-search" type="search" autoComplete="off" aria-label="Search a color name or exact HEX" value={query}
            onChange={event => { setQuery(event.target.value); setShowNames(true); }}
            placeholder="Search a color name or enter #RRGGBB" />
          <button type="submit">Locate color <span aria-hidden="true">↗</span></button>
        </form>
        {showNames && namedResults.length > 0 && (
          <div className="pfx-explore__search-matches" aria-label="Matching named colors">
            {namedResults.map(([name, hex]) => (
              <button key={name} type="button" onClick={() => jumpTo(hex)}>
                <span style={{ background: hex }} /> <strong>{name}</strong> <code>{hex.toUpperCase()}</code>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pfx-explore__workbench">
        <div className="pfx-explore__main">
          <section className="pfx-explore__spectrum pfx-explore__panel" aria-labelledby="pfx-spectrum-title">
            <div className="pfx-explore__section-head">
              <div><span className="pfx-explore__section-index">01 / DISCOVERY</span><h2 id="pfx-spectrum-title">The spectrum</h2>
                <p>Move through hue continuously, or jump to a color family.</p></div>
              <span className="pfx-explore__scientific">PERCEPTUAL HUE · OKLCH</span>
            </div>
            <div className="pfx-explore__spectrum-body">
              <div className="pfx-explore__wheel-wrap">
                <button type="button" className="pfx-explore__wheel"
                  aria-label={"Hue " + Math.round(selected.h) + " degrees. Use arrow keys to adjust."}
                  onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); updateFromWheel(event); }}
                  onPointerMove={event => { if (event.buttons) updateFromWheel(event); }}
                  onKeyDown={wheelKey}>
                  <span className="pfx-explore__wheel-inner" style={{ background: wheelColor }}>
                    <span>HUE</span><strong>{Math.round(selected.h)}°</strong>
                  </span>
                  <span className="pfx-explore__wheel-indicator" style={{ transform: "rotate(" + selected.h + "deg)" }}><i /></span>
                </button>
              </div>
              <div className="pfx-explore__spectrum-controls">
                <div className="pfx-explore__family-label">COLOR REGIONS <span>SELECT A STARTING POINT</span></div>
                <div className="pfx-explore__families">
                  {FAMILIES.map(family => (
                    <button type="button" key={family.label}
                      className={hueDistance(selected.h, family.hue) < 14 && selected.c > 0.025 ? "is-active" : ""}
                      onClick={() => updateLch(selected.l || .7, Math.max(selected.c, .13), family.hue)}>
                      <span style={{ background: gamutMappedHex({ l: .7, c: .14, h: family.hue }) }}/>{family.label}
                    </button>
                  ))}
                  <button type="button" className={selected.c < 0.025 ? "is-active" : ""}
                    onClick={() => updateLch(selected.l, 0, selected.h)}>
                    <span className="pfx-explore__neutral-dot" />Neutral
                  </button>
                </div>
                <div className="pfx-explore__hue-track">
                  <label htmlFor="pfx-hue-control">Hue <output>{Math.round(selected.h)}°</output></label>
                  <input id="pfx-hue-control" type="range" min="0" max="359" step="1" value={Math.round(selected.h)}
                    onChange={event => updateLch(selected.l, selected.c, Number(event.target.value))} />
                </div>
              </div>
            </div>
          </section>

          <section className="pfx-explore__depth pfx-explore__panel" aria-labelledby="pfx-depth-title">
            <div className="pfx-explore__section-head">
              <div><span className="pfx-explore__section-index">02 / REFINEMENT</span><h2 id="pfx-depth-title">Color depth</h2>
                <p>Explore lightness and chroma. Transparent regions fall outside the sRGB gamut.</p></div>
              <span className="pfx-explore__scientific">OKLCH · GAMUT AWARE</span>
            </div>
            <div className="pfx-explore__depth-layout">
              <div className="pfx-explore__depth-surface">
                <div className="pfx-explore__depth-vertical"><span>LIGHTER</span><span>DARKER</span></div>
                <div className="pfx-explore__depth-map">
                  <canvas ref={canvasRef} role="img" aria-label="Oklch lightness and chroma map. Use the sliders alongside for keyboard access."
                    onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); updateFromDepth(event); }}
                    onPointerMove={event => { if (event.buttons) updateFromDepth(event); }} />
                  <span className="pfx-explore__depth-cursor" aria-hidden="true"
                    style={{ left: (selected.c / MAX_CHROMA * 100) + "%", top: ((1 - selected.l) * 100) + "%" }} />
                </div>
                <div className="pfx-explore__depth-axis"><span>LESS CHROMA</span><span>MORE CHROMA</span></div>
              </div>
              <div className="pfx-explore__depth-controls">
                <div className="pfx-explore__control-head"><span>PRECISE ADJUSTMENT</span><strong>OKLCH</strong></div>
                <label>Lightness <output>{Math.round(selected.l * 100)}%</output>
                  <input type="range" min="0" max="100" step="1" value={Math.round(selected.l * 100)}
                    onChange={event => updateLch(Number(event.target.value) / 100, selected.c, selected.h)} />
                </label>
                <label>Chroma <output>{selected.c.toFixed(3)}</output>
                  <input type="range" min="0" max={MAX_CHROMA} step="0.002" value={selected.c}
                    onChange={event => updateLch(selected.l, Number(event.target.value), selected.h)} />
                </label>
                <button type="button" className="pfx-explore__reset-tone"
                  onClick={() => updateLch(.7, .14, selected.h)}>Reset tone <span aria-hidden="true">↗</span></button>
                <div className="pfx-explore__gamut-note"><span /> Out-of-gamut choices are mapped to the nearest chroma boundary at the chosen hue and lightness.</div>
              </div>
            </div>
            <div className="pfx-explore__related">
              <div className="pfx-explore__related-label"><strong>Nearby shades</strong><span>Perceptually related · select or copy</span></div>
              <div className="pfx-explore__related-grid">
                {related.map(hex => (
                  <div className="pfx-explore__related-item" key={hex}>
                    <button type="button" aria-label={"Select " + hex} style={{ background: hex }} onClick={() => choose(hex)} />
                    <button type="button" className="pfx-explore__related-code" onClick={() => void copy(hex)} title={"Copy " + hex}>{hex.slice(1).toUpperCase()}</button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="pfx-explore__atlas pfx-explore__panel" aria-labelledby="pfx-atlas-title">
            <div className="pfx-explore__section-head">
              <div><span className="pfx-explore__section-index">03 / EXACT RGB SPACE</span><h2 id="pfx-atlas-title">The complete atlas</h2>
                <p>Every tile contains a precise range. Open it to subdivide all the way to individual colors.</p></div>
              <span className="pfx-explore__scientific">64-WAY SUBDIVISION · NO PAGINATION</span>
            </div>
            <div className="pfx-explore__atlas-tools">
              <div className="pfx-explore__crumbs" aria-label="Atlas depth">
                <button type="button" onClick={() => setStack([])} aria-current={stack.length === 0 ? "step" : undefined}>All RGB</button>
                {stack.map((tile, i) => (
                  <span key={tile.depth}><span aria-hidden="true">/</span>
                    <button type="button" aria-current={i === stack.length - 1 ? "step" : undefined}
                      onClick={() => setStack(stack.slice(0, i + 1))}>Level {i + 1}</button></span>
                ))}
              </div>
              <div className="pfx-explore__atlas-actions">
                <label>Arrange <select value={sort} onChange={event => setSort(event.target.value as Sort)}>
                  <option value="perceptual">Nearest first</option><option value="lightness">Lightness</option><option value="rgb">RGB order</option>
                </select></label>
                <button type="button" disabled={stack.length === 0} onClick={() => setStack(v => v.slice(0, -1))}>← Back</button>
              </div>
            </div>
            <div className="pfx-explore__atlas-meta">
              <span><strong>LEVEL {String(currentStage).padStart(2, "0")} / 04</strong> · {format.format(tiles.length)} ranges</span>
              <span>{format.format(tileCount(tiles[0]))} {currentStage === 4 ? "exact color per tile" : "colors per range"}</span>
            </div>
            <div className="pfx-explore__atlas-grid" aria-label="RGB atlas regions">
              {tiles.map(tile => {
                const hex = rgbToHex(tileRepresentative(tile));
                const count = tileCount(tile);
                const isCurrent = tileHasHex(tile, selectedHex);
                const range = tileRange(tile);
                const foreground = contrastRatio(hex, "#ffffff") > contrastRatio(hex, "#000000") ? "#fff" : "#111";
                return <article key={[tile.depth, tile.r, tile.g, tile.b].join("-")} className={"pfx-explore__atlas-tile" + (isCurrent && selectedContained ? " is-current" : "")}
                  style={{ backgroundColor: hex, color: foreground }}>
                  <button type="button" className="pfx-explore__atlas-open"
                    title={count === 1 ? "Select " + range.min : "Open range " + range.min + " to " + range.max}
                    aria-label={count === 1 ? "Select exact color " + range.min : "Open RGB range from " + range.min + " to " + range.max}
                    onClick={() => count === 1 ? choose(hex) : setStack(v => [...v, tile])}>
                    <span className="pfx-explore__atlas-tile-top">{count === 1 ? "EXACT" : format.format(count) + " COLORS"} {isCurrent ? "●" : ""}</span>
                    <span className="pfx-explore__atlas-tile-code">{hex.toUpperCase()}</span>
                  </button>
                  <button type="button" className="pfx-explore__atlas-copy" aria-label={"Copy representative " + hex}
                    title={"Copy " + hex} onClick={() => void copy(hex)}>↗</button>
                </article>;
              })}
            </div>
            <footer className="pfx-explore__atlas-foot"><span>All 16,777,216 sRGB values remain reachable through 4 levels.</span>
              <button type="button" onClick={() => jumpTo(selectedHex)}>Locate selected color ↗</button></footer>
          </section>
        </div>

        <aside className="pfx-explore__inspector" aria-label="Selected color inspector">
          <div className="pfx-explore__inspector-head"><span>COLOR INSPECTOR</span>
            <button type="button" aria-pressed={favorites.includes(selectedHex)} onClick={() => save(selectedHex)}>
              {favorites.includes(selectedHex) ? "★ Saved" : "☆ Save"}</button></div>
          <div className="pfx-explore__inspector-color" style={{ backgroundColor: selectedHex }} />
          <div className="pfx-explore__inspector-ident">
            <span>{activeName ?? "SELECTED COLOR"}</span>
            <button type="button" onClick={() => void copy(selectedHex)} title="Copy HEX">{hexUpper(selectedHex)} <span>↗</span></button>
            <small>Click the color code to copy</small>
          </div>
          <div className="pfx-explore__inspector-values">
            <div><span>RGB</span><code>{selectedRgb.join(", ")}</code><button type="button" onClick={() => void copyText(rgbText, "RGB")}>Copy</button></div>
            <div><span>HSL</span><code>{Math.round(hslStats.hue)}°, {Math.round(hslStats.saturation)}%, {Math.round(hslStats.lightness)}%</code><button type="button" onClick={() => void copyText(hsl, "HSL")}>Copy</button></div>
            <div><span>OKLCH</span><code>{selected.l.toFixed(3)} · {selected.c.toFixed(3)} · {Math.round(selected.h)}°</code><button type="button" onClick={() => void copyText("oklch(" + (selected.l * 100).toFixed(2) + "% " + selected.c.toFixed(4) + " " + selected.h.toFixed(2) + ")", "OKLCH")}>Copy</button></div>
          </div>

          <div className="pfx-explore__contrast">
            <div className="pfx-explore__contrast-top"><strong>Text contrast</strong><span>{ratio.toFixed(2)}:1</span></div>
            <div className="pfx-explore__contrast-preview" style={{ color: selectedHex, backgroundColor: background === "white" ? "#fff" : "#000" }}>
              <strong>Color in context</strong><span>Readable text matters.</span>
            </div>
            <div className="pfx-explore__contrast-bottom">
              <div role="group" aria-label="Contrast background">
                <button type="button" aria-pressed={background === "white"} onClick={() => setBackground("white")}>White</button>
                <button type="button" aria-pressed={background === "black"} onClick={() => setBackground("black")}>Black</button>
              </div>
              <span>{ratio >= 4.5 ? "AA normal text" : ratio >= 3 ? "AA large text only" : "Below AA text"}</span>
            </div>
          </div>
          <div className="pfx-explore__inspector-links">
            <button type="button" onClick={() => openPicker(selectedHex)}>Open Picker <span>↗</span></button>
            <button type="button" onClick={() => openTones(selectedHex)}>Create Tones <span>↗</span></button>
          </div>
          <div className="pfx-explore__inspector-note">The canvas is a perceptual guide. The RGB atlas below it is an exact, exhaustive digital index.</div>
        </aside>
      </div>
      <p role="status" aria-live="polite" className="pfx-explore__status">{status}</p>
    </section>
  );
}
