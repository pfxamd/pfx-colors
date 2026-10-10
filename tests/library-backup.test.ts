import { describe, expect, it } from "vitest";
import {
  parseLibraryBackup, serializeLibraryBackup, readColorSets, readSavedGradients,
  type LibrarySnapshot,
} from "../src/app/library-backup";

const gradient = {
  type: "linear" as const, angle: 100, centerX: 0.3, centerY: 0.7,
  interpolationSpace: "oklch",
  stops: [
    { position: 0, color: { space: "srgb", coordinates: [0.1, 0.2, 0.3], alpha: 1 } },
    { position: 1, color: { space: "srgb", coordinates: [0.7, 0.8, 0.9], alpha: 1 } },
  ],
};
const fixture: LibrarySnapshot = {
  favorites: ["#aabbcc"],
  recent: ["#ddeeff"],
  sets: [{ id: "set-1", name: "Test palette", created: 123, colors: ["#aabbcc", "#ddeeff"] }],
  gradients: [{ id: "gradient-1", name: "Test gradient", created: 124, gradient }],
};

describe("Library backups", () => {
  it("round-trips favorites, recent colors, palettes and editable geometry", () => {
    const saved = parseLibraryBackup(serializeLibraryBackup(fixture));
    expect(saved).toEqual(fixture);
  });

  it("rejects unsupported files and malformed payloads", () => {
    expect(() => parseLibraryBackup("{}")).toThrow();
    expect(() => parseLibraryBackup(JSON.stringify({format: "pfx-colors-library",version: 999}))).toThrow();
    expect(() => parseLibraryBackup("x".repeat(1_000_001))).toThrow();
    expect(() => parseLibraryBackup(JSON.stringify({
      ...fixture, gradients: [{id:"bad",name:"Wrong",created:12,gradient:{stops:[]}}],
    }))).toThrow();
  });

  it("filters invalid entries from local storage rather than crashing", () => {
    expect(readColorSets([null, {id:"s",name:"S",created:1,colors:["invalid","#abc123","#abc123"]}]))
      .toEqual([{id:"s",name:"S",created:1,colors:["#abc123"]}]);
    expect(readSavedGradients([null, {id:"g",name:"G",created:1,gradient}])).toHaveLength(1);
    expect(readSavedGradients([{id:"g",name:"G",created:1,gradient:{stops:[]}}])).toEqual([]);
  });
});
