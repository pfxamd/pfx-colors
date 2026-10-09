import { describe, expect, it } from "vitest";
import { readGradientDraft, GRADIENT_DRAFT_KEY } from "../src/app/gradient-session";
import { readStored, isHex, numberBetween, oneOf } from "../src/app/workspace-state";

describe("Workspace persistence validation", () => {
  it("rejects corrupted values and uses intended defaults", () => {
    expect(isHex("#aa55ff")).toBe(true);
    expect(isHex("red")).toBe(false);
    expect(numberBetween(0, 100)(105)).toBe(false);
    expect(oneOf(["light", "dark"] as const)("dark")).toBe(true);
    expect(readStored("test", "home", oneOf(["home", "picker"] as const))).toBe("home");
  });
  it("rejects malformed or unsafe gradient drafts", () => {
    expect(readGradientDraft({ getItem: () => "{bad" })).toBeNull();
    expect(readGradientDraft({ getItem: () => JSON.stringify({ type: "radial", stops: [] }) })).toBeNull();
    const valid = {
      type: "linear", angle: 90, centerX: 0.5, centerY: 0.5, interpolationSpace: "oklch",
      stops: [
        { position: 0, color: { space: "srgb", coordinates: [0.1, 0.2, 0.3], alpha: 1 } },
        { position: 1, color: { space: "srgb", coordinates: [0.4, 0.5, 0.6], alpha: 1 } },
      ],
    };
    const result = readGradientDraft({ getItem: key =>
      key === GRADIENT_DRAFT_KEY ? JSON.stringify(valid) : null });
    expect(result?.stops).toHaveLength(2);
    expect(result?.interpolationSpace).toBe("oklch");
  });
});
