import { describe, expect, it } from "vitest";
import { collectColorGroups, colorDescription, searchExploreColors, type ExploreCriteria } from "../src/app/explore-discovery";
import type { ColorRecord } from "../src/app/explore-catalog";
const swatches: ColorRecord[] = [
  ["True Red", "#ff0000", "red"],
  ["Blue", "#0000ff", "blue"],
  ["White", "#ffffff", "white"],
  ["Red Near", "#fe0000", "red"],
];
const criteria: ExploreCriteria = { query: "", group: "all", family: "all",
  lightMin: 0, lightMax: 100, chromaMin: 0, nearest: false, reference: "#ff0000" };
describe("Explore advanced discovery", () => {
  it("filters names, families, perceptual lightness and chroma", () => {
    expect(searchExploreColors(swatches, {...criteria,query:"near"}).map(c=>c[0])).toEqual(["Red Near"]);
    expect(searchExploreColors(swatches, {...criteria,group:"red"})).toHaveLength(2);
    expect(searchExploreColors(swatches, {...criteria,family:"red"})).toHaveLength(2);
    expect(searchExploreColors(swatches, {...criteria,lightMin:95})).toHaveLength(1);
    expect(searchExploreColors(swatches, {...criteria,chromaMin:10}).map(c=>c[0])).not.toContain("White");
  });
  it("ranks perceptually close colors first without mutating upstream", () => {
    const result=searchExploreColors(swatches,{...criteria,nearest:true});
    expect(result[0][1]).toBe("#ff0000");
    expect(result[1][1]).toBe("#fe0000");
    expect(swatches[0][0]).toBe("True Red");
  });
  it("preserves group data and distinguishes scales from visualization palettes", () => {
    const rows: ColorRecord[]=[
      ...Array.from({length:10},(_,i):ColorRecord=>["Blue "+i,"#"+String(i+1).padStart(6,"0"),"blue"]),
      ...Array.from({length:4},(_,i):ColorRecord=>["Set "+i,"#"+String(i+1).padStart(6,"1"),"Categorical / Set"]),
      ["Red","#ff0000","Named colors"],
    ];
    expect(collectColorGroups(rows,"scales")).toHaveLength(1);
    expect(collectColorGroups(rows,"palettes")).toHaveLength(1);
    expect(collectColorGroups(rows,"palettes")[0].colors).toHaveLength(4);
  });
  it("returns useful, stable color formats", () => {
    const info=colorDescription("#ff0000");
    expect(info.rgb).toBe("rgb(255, 0, 0)");
    expect(info.hsl).toBe("hsl(0 100% 50%)");
    expect(info.oklch).toMatch(/^oklch\(/);
  });
});
