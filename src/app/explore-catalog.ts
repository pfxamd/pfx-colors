import { NAMED_COLORS } from "./color-library";

export type CatalogId = "css" | "names" | "open" | "radix" | "tailwind" | "d3";
export type ExploreSource = CatalogId | "overview" | "all";
export type ColorRecord = readonly [name: string, hex: string, group: string];

export type LibraryInfo = {
  id: CatalogId;
  label: string;
  subtitle: string;
  total: number;
  url: string;
  preview: readonly string[];
};

export const LIBRARIES: readonly LibraryInfo[] = [
  {
    id: "css", label: "CSS Named Colors", subtitle: "Standard browser color names",
    total: 148, url: "https://www.w3.org/TR/css-color-4/#named-colors",
    preview: ["#f0f8ff", "#ff7f50", "#6495ed", "#d8bfd8", "#40e0d0"],
  },
  {
    id: "names", label: "Color Names", subtitle: "Thousands of searchable named shades",
    total: 31942, url: "https://github.com/meodai/color-names",
    preview: ["#c93f38", "#a59344", "#7b463b", "#225577", "#a0d2db"],
  },
  {
    id: "open", label: "Open Color", subtitle: "Practical ten-step color scales",
    total: 132, url: "https://github.com/yeun/open-color",
    preview: ["#ff6b6b", "#845ef7", "#339af0", "#20c997", "#fcc419"],
  },
  {
    id: "radix", label: "Radix Colors", subtitle: "Light and dark interface palettes",
    total: 744, url: "https://github.com/radix-ui/colors",
    preview: ["#8d8d8d", "#e5484d", "#6e56cf", "#0091ff", "#30a46c"],
  },
  {
    id: "tailwind", label: "Tailwind Colors", subtitle: "Ready-to-use design system shades",
    total: 242, url: "https://github.com/tailwindlabs/tailwindcss",
    preview: ["#0f172a", "#2563eb", "#a855f7", "#f97316", "#84cc16"],
  },
  {
    id: "d3", label: "D3 Chromatic", subtitle: "Categorical, diverging and data scales",
    total: 301, url: "https://github.com/d3/d3-scale-chromatic",
    preview: ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd"],
  },
] as const;

export const TOTAL_COLOR_ENTRIES = LIBRARIES.reduce((sum, source) => sum + source.total, 0);
export const INITIAL_CSS_COLORS: ColorRecord[] = NAMED_COLORS.map(
  ([name, hex]) => [name, hex, "CSS Names"],
);

export function filterColorRecords(
  colors: readonly ColorRecord[], query: string, group: string,
): ColorRecord[] {
  const needle = query.trim().toLocaleLowerCase().replace(/\s+/g, "");
  return colors.filter(([name, hex, family]) => {
    if (group !== "all" && family !== group) return false;
    if (!needle) return true;
    return (name + family).toLocaleLowerCase().replace(/\s+/g, "").includes(needle) ||
      hex.slice(1).includes(needle.replace(/^#/, ""));
  });
}

export async function loadColorCatalog(id: Exclude<CatalogId, "css">): Promise<ColorRecord[]> {
  const url = new URL("./palettes/" + id + ".json", document.baseURI);
  const response = await fetch(url);
  if (!response.ok) throw new Error("Unable to load " + id + " color library");
  const json: unknown = await response.json();
  if (!Array.isArray(json) || !json.every(record =>
    Array.isArray(record) && record.length === 3 &&
    typeof record[0] === "string" && typeof record[1] === "string" &&
    typeof record[2] === "string" && /^#[0-9a-f]{6}$/i.test(record[1]))) {
    throw new Error("Invalid color library: " + id);
  }
  return json as ColorRecord[];
}
