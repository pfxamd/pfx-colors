import { describe, expect, it } from "vitest";
import {
  LIBRARIES, INITIAL_CSS_COLORS, TOTAL_COLOR_ENTRIES, filterColorRecords,
} from "../src/app/explore-catalog";

describe("Explore open-source catalog directory", () => {
  it("lists all six documented color libraries with source links", () => {
    expect(LIBRARIES.map(source => source.id)).toEqual([
      "css", "names", "open", "radix", "tailwind", "d3",
    ]);
    expect(TOTAL_COLOR_ENTRIES).toBe(33509);
    expect(LIBRARIES.every(source => source.url.startsWith("https://"))).toBe(true);
    expect(INITIAL_CSS_COLORS).toHaveLength(148);
  });
  it("searches HEX, name and groups without removing color aliases", () => {
    const source = [
      ["Blue Ocean", "#1040b0", "Ocean"],
      ["Blue", "#0000ff", "Web"],
      ["Cobalt", "#1040b0", "Metal"],
    ] as const;
    expect(filterColorRecords(source, "blue", "all")).toHaveLength(2);
    expect(filterColorRecords(source, "#1040b0", "all")).toHaveLength(2);
    expect(filterColorRecords(source, "blue", "Ocean")).toHaveLength(1);
    expect(filterColorRecords(source, "", "all")).toHaveLength(3);
  });
});
