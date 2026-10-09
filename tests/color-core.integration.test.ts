import { describe, expect, it } from "vitest";
import {
  PfxColorsWorkspace,
  createGradient,
  generateColorStudy,
  generateHarmony,
  sampleGradient,
  selectColor,
} from "@pfx/color-core";

describe("PFx Color Core integration", () => {
  it("provides working color computations through the pinned core", () => {
    expect(selectColor("#336699").hex).toBe("#336699");
    expect(generateHarmony("#ff0000", "triadic").colors).toHaveLength(3);
    expect(generateColorStudy("#336699", { random: () => 0.3 }).colors).toHaveLength(10);
    const workspace = new PfxColorsWorkspace("#336699");
    workspace.generateTonalPalette({ count: 6 });
    expect(workspace.getState().palette?.colors).toHaveLength(6);
    const gradient = createGradient([
      { color: "#ff0000", position: 0 },
      { color: "#00ff00", position: 0.5 },
      { color: "#0000ff", position: 1 },
    ]);
    expect(sampleGradient(gradient, 0.5).hex).toBe("#00ff00");
  });
});
