import { describe, expect, it } from "vitest";
import { refineConicCenter } from "../src/rust/conic-center";

const initial = (width: number, height: number) => {
  const image = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < image.length; i += 4) {
    image[i] = 29;
    image[i + 1] = 61;
    image[i + 2] = 91;
    image[i + 3] = 255;
  }
  return image;
};
const pixel = (image: Uint8ClampedArray, w: number, x: number, y: number) =>
  Array.from(image.slice((y * w + x) * 4, (y * w + x + 1) * 4));

describe("Conic center supersampling", () => {
  it("resolves an angular split inside the singular center pixel in linear light", () => {
    const img = initial(15, 15);
    refineConicCenter(img, 15, 15, 7.5, 7.5,
      (x) => x < 7.5 ? { channels: [1, 0, 0], alpha: 1 } :
        { channels: [0, 0, 1], alpha: 1 });
    const center = pixel(img, 15, 7, 7);
    expect(center[0]).toBeGreaterThan(150);
    expect(center[2]).toBeGreaterThan(150);
    expect(center[1]).toBe(0);
    expect(center[3]).toBe(255);
    // The ordinary Rust raster remains untouched outside the disk.
    expect(pixel(img, 15, 0, 0)).toEqual([29, 61, 91, 255]);
    expect(pixel(img, 15, 14, 14)).toEqual([29, 61, 91, 255]);
  });

  it("premultiplies alpha so transparent colors do not leave a dark fringe", () => {
    const img = initial(15, 15);
    refineConicCenter(img, 15, 15, 7.5, 7.5,
      (x) => x < 7.5 ? { channels: [1, 0.3, 0], alpha: 1 } :
        { channels: [0, 0, 0], alpha: 0 });
    const center = pixel(img, 15, 7, 7);
    expect(center[0]).toBe(255);
    expect(center[1]).toBeCloseTo(77, 0);
    expect(center[2]).toBe(0);
    expect(center[3]).toBeGreaterThan(110);
    expect(center[3]).toBeLessThan(145);
  });

  it("ignores malformed raster dimensions without mutating output", () => {
    const img = initial(3, 3);
    const snapshot = new Uint8ClampedArray(img);
    refineConicCenter(img, 4, 3, 2, 2, () => {
      throw new Error("must not sample");
    });
    expect(img).toEqual(snapshot);
  });
});
