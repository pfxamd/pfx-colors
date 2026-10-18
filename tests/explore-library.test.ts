import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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
  it("ships every catalog as local, valid and complete color data", () => {
    for (const library of LIBRARIES.filter(item => item.id !== "css")) {
      const file = new URL("../public/palettes/" + library.id + ".json", import.meta.url);
      const records: unknown = JSON.parse(readFileSync(file, "utf-8"));
      expect(Array.isArray(records)).toBe(true);
      if (!Array.isArray(records)) continue;
      expect(records).toHaveLength(library.total);
      expect(records.every(record =>
        Array.isArray(record) && record.length === 3 &&
        typeof record[0] === "string" && typeof record[2] === "string" &&
        /^#[0-9a-f]{6}$/i.test(record[1]))).toBe(true);
    }
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
