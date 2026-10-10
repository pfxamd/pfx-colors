import { useMemo, useState } from "react";
import type { ColorInput, WorkspaceState } from "@pfx/color-core";
import { generateColorStudy } from "../rust/operations";
import { copyColorText } from "./clipboard";
import { isHex, numberBetween, useStoredState } from "./workspace-state";

const STUDY_SETTINGS = { lightness: 58, chroma: 58, hueRange: 58, toneRange: 58 };

function randomSequence(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    current += 0x6d2b79f5;
    let n = current;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

type Props = {
  state: WorkspaceState;
  commitColor: (input: ColorInput) => void;
};

export function Home({ state, commitColor }: Props) {
  const activeHex = state.color.hex.toLowerCase();
  const [seed, setSeed] = useStoredState("pfx-colors.home.seed.v2", activeHex, isHex);
  const [randomSeed, setRandomSeed] = useStoredState(
    "pfx-colors.home.random.v2", 64521, numberBetween(0, 2147483647),
  );
  const [notice, setNotice] = useState("");

  // Keep the existing color core and its deterministic session; present a
  // small quick palette instead of the full ten-color study controls.
  const colors = useMemo(() => generateColorStudy(seed, {
    ...STUDY_SETTINGS,
    random: randomSequence(randomSeed),
  }).colors.filter((_, index) => index % 2 === 0).slice(0, 5), [seed, randomSeed]);

  const generate = () => {
    setSeed(activeHex);
    setRandomSeed(previous => (previous + 1 + Math.floor(Math.random() * 1000000000)) % 2147483647);
    setNotice("");
  };

  const copy = async (hex: string) => {
    setNotice(await copyColorText(hex.toUpperCase()) ? "Copied " + hex.toUpperCase() : "Clipboard unavailable");
  };

  return (
    <section className="pfx-home pfx-v2__page" aria-label="Home color workspace">
      <div className="pfx-home__generator">
        <div className="pfx-home__heading">
          <div>
            <h1>Quick Palette</h1>
            <p>Five colors from your current shade.</p>
          </div>
          <button type="button" className="pfx-home__generate" onClick={generate}>
            <span aria-hidden="true">↻</span> Generate
          </button>
        </div>
        <div className="pfx-home__palette" aria-label="Generated color palette">
          {colors.map((color, index) => (
            <div className="pfx-home__item" key={index}>
              <button type="button" className="pfx-home__swatch"
                style={{ backgroundColor: color.hex }}
                aria-pressed={activeHex === color.hex.toLowerCase()}
                aria-label={"Select color " + color.hex.toUpperCase()}
                onClick={() => { commitColor(color.hex); setNotice(""); }}>
                {activeHex === color.hex.toLowerCase()
                  && <span className="pfx-home__selected" aria-hidden="true">✓</span>}
              </button>
              <button type="button" className="pfx-home__code"
                aria-label={"Copy " + color.hex.toUpperCase()}
                title={"Copy " + color.hex.toUpperCase()}
                onClick={() => void copy(color.hex)}>{color.hex.toUpperCase()}</button>
            </div>
          ))}
        </div>
        <p className="pfx-home__notice" role="status" aria-live="polite">{notice}</p>
      </div>
    </section>
  );
}
