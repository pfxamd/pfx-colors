import { describe, expect, it } from "vitest";
import { extractPaletteFromPixels } from "../src/app/image-palette-model";

function pixels(colors: Array<[number,number,number,number?]>) {
  const data = new Uint8ClampedArray(colors.flatMap(([r,g,b,a=255]) => [r,g,b,a]));
  return { width: colors.length, height: 1, data };
}

describe("Image palette extraction", () => {
  it("detects discrete red, green and blue image regions", () => {
    const source = pixels([
      ...Array(20).fill([220,34,55]), ...Array(15).fill([30,210,70]),
      ...Array(10).fill([29,58,229]),
    ]);
    const result = extractPaletteFromPixels(source, 6);
    expect(result).toHaveLength(3);
    expect(result.map(item=>item.hex)).toEqual([
      "#dc2237", "#1ed246", "#1d3ae5",
    ]);
  });
  it("ignores fully transparent regions and handles one-color artwork", () => {
    const source = pixels([[0,0,0,0], [25,50,75], [25,50,75]]);
    expect(extractPaletteFromPixels(source, 6)).toEqual([{hex:"#19324b",pixels:2}]);
  });
  it("handles empty and invalid inputs", () => {
    expect(extractPaletteFromPixels({width:0,height:0,data:new Uint8ClampedArray()}, 4)).toEqual([]);
    expect(() => extractPaletteFromPixels(pixels([[0,0,0]]), 1)).toThrow();
    expect(() => extractPaletteFromPixels(pixels([[0,0,0]]), 13)).toThrow();
  });
});
