import { normalizeHex } from "./color-library";
import { pairContrast } from "./explore-model";

export type ContrastCriterion = { label: string; threshold: number; passes: boolean };

export function contrastCriteria(text: string, background: string): {
  ratio: number; criteria: ContrastCriterion[];
} {
  if (!/^#[a-f0-9]{6}$/i.test(text) || !/^#[a-f0-9]{6}$/i.test(background))
    throw new RangeError("Provide two opaque six-digit HEX colors");
  const fg = normalizeHex(text), bg = normalizeHex(background);
  if (!fg || !bg) throw new RangeError("Invalid HEX colors");
  const ratio = pairContrast(fg, bg);
  return {
    ratio,
    criteria: [
      { label: "AA · Normal text", threshold: 4.5, passes: ratio >= 4.5 },
      { label: "AA · Large text", threshold: 3, passes: ratio >= 3 },
      { label: "AAA · Normal text", threshold: 7, passes: ratio >= 7 },
      { label: "AAA · Large text", threshold: 4.5, passes: ratio >= 4.5 },
    ],
  };
}

export function readableInk(background: string): string {
  const light = "#ffffff";
  const dark = "#000000";
  return pairContrast(light, background) >= pairContrast(dark, background) ? light : dark;
}
