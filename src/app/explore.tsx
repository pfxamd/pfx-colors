import { useMemo, useState } from "react";
import type { ColorInput } from "@pfx/color-core";
import { NAMED_COLORS } from "./color-library";
import { copyColorText } from "./clipboard";

type Props = {
  activeHex: string;
  select: (hex: ColorInput) => void;
};

const SORTED_NAMES = [...NAMED_COLORS].sort(([a], [b]) => a.localeCompare(b, "en"));

export function Explore({ activeHex, select }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const needle = query.toLowerCase().trim().replace(/\s+/g, "");
  const colors = useMemo(() => SORTED_NAMES.filter(([name, hex]) => {
    const keyword = name.toLowerCase().replace(/\s+/g, "");
    return keyword.includes(needle) || hex.slice(1).includes(needle.replace(/^#/, ""));
  }), [needle]);

  const copy = async (value: string) => {
    const success = await copyColorText(value.toUpperCase());
    setStatus(success ? value.toUpperCase() + " copied" : "Clipboard unavailable");
  };

  return (
    <section className="pfx-explore pfx-v2__page" aria-label="Explore named colors">
      <div className="pfx-explore__layout">
        <header className="pfx-explore__header">
          <div className="pfx-explore__heading">
            <h1>Explore colors</h1>
            <p>Browse the named colors of the web.</p>
          </div>
          <a className="pfx-explore__source" href="https://www.w3.org/TR/css-color-4/#named-colors"
            target="_blank" rel="noreferrer">CSS Color 4 <span aria-hidden="true">↗</span></a>
        </header>

        <div className="pfx-explore__toolbar">
          <label className="pfx-explore__search">
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="10.7" cy="10.7" r="6.6" /><path d="m16 16 5 5" />
            </svg>
            <input type="search" value={query} onChange={event => { setQuery(event.target.value); setStatus(""); }}
              aria-label="Search named colors" placeholder="Search by name or HEX" autoComplete="off" spellCheck={false} />
          </label>
          <span className="pfx-explore__count" aria-live="polite">
            {colors.length} {colors.length === 1 ? "name" : "names"}
          </span>
          <span className="pfx-explore__feedback" role="status" aria-live="polite">{status}</span>
        </div>

        <div className="pfx-explore__viewport" role="region" aria-label="Named color results" tabIndex={0}>
          {colors.length > 0 ? (
            <div className="pfx-explore__list">
              {colors.map(([name, hex]) => {
                const selected = activeHex.toLowerCase() === hex;
                return (
                  <div className={"pfx-explore__chip" + (selected ? " is-active" : "")} key={name}>
                    <button className="pfx-explore__select" type="button" aria-pressed={selected}
                      title={name + " · " + hex.toUpperCase()}
                      aria-label={"Select " + name + " " + hex.toUpperCase()}
                      onClick={() => { select(hex); setStatus(""); }}>
                      <span className="pfx-explore__swatch" style={{ backgroundColor: hex }} aria-hidden="true" />
                      <span className="pfx-explore__name">{name}</span>
                    </button>
                    <button className="pfx-explore__copy" type="button" title={"Copy " + hex.toUpperCase()}
                      aria-label={"Copy " + name + " " + hex.toUpperCase()}
                      onClick={() => void copy(hex)}>
                      <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor"
                        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="6.5" y="6.5" width="10" height="10" rx="1.5" />
                        <path d="M13.5 6V5A1.5 1.5 0 0 0 12 3.5H5A1.5 1.5 0 0 0 3.5 5v7A1.5 1.5 0 0 0 5 13.5h1" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="pfx-explore__empty">No matching named colors.</p>
          )}
        </div>
      </div>
    </section>
  );
}
