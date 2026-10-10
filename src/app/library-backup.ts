import { normalizeHex } from "./color-library";
import { parseGradientDraft, type SavedGradientDraft } from "./gradient-session";

export type SavedColorSet = { id: string; name: string; colors: string[]; created: number };
export type SavedGradient = { id: string; name: string; created: number; gradient: SavedGradientDraft };
export type LibrarySnapshot = {
  favorites: string[];
  recent: string[];
  sets: SavedColorSet[];
  gradients: SavedGradient[];
};

const validDate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const validName = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export function readColors(input: unknown, limit: number): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.flatMap((value: unknown) => {
    const hex = typeof value === "string" ? normalizeHex(value) : null;
    return hex ? [hex] : [];
  }))].slice(0, limit);
}

export function readColorSets(input: unknown): SavedColorSet[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 40).flatMap((value: unknown) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Partial<SavedColorSet>;
    if (!validName(item.id) || !validName(item.name) || !validDate(item.created) ||
        !Array.isArray(item.colors)) return [];
    const colors = readColors(item.colors, 16);
    if (!colors.length) return [];
    return [{
      id: item.id.slice(0, 80), name: item.name.slice(0, 60),
      created: item.created, colors,
    }];
  });
}

export function readSavedGradients(input: unknown): SavedGradient[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 40).flatMap((value: unknown) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Partial<SavedGradient>;
    if (!validName(item.id) || !validName(item.name) || !validDate(item.created)) return [];
    const gradient = parseGradientDraft(item.gradient);
    if (!gradient) return [];
    return [{
      id: item.id.slice(0, 80), name: item.name.slice(0, 60),
      created: item.created, gradient,
    }];
  });
}

export function serializeLibraryBackup(data: LibrarySnapshot): string {
  return JSON.stringify({
    format: "pfx-colors-library", version: 1,
    exportedAt: new Date().toISOString(),
    favorites: data.favorites, recent: data.recent,
    sets: data.sets, gradients: data.gradients,
  }, null, 2);
}

export function parseLibraryBackup(json: string): LibrarySnapshot {
  if (json.length > 1_000_000) throw new Error("Backup exceeds the 1 MB limit");
  const value: unknown = JSON.parse(json);
  if (!value || typeof value !== "object") throw new Error("Invalid library");
  const item = value as Record<string, unknown>;
  if (item.format !== "pfx-colors-library" || item.version !== 1)
    throw new Error("Unsupported backup");
  for (const key of ["favorites", "recent", "sets", "gradients"]) {
    if (!Array.isArray(item[key])) throw new Error("Missing " + key);
  }
  const result: LibrarySnapshot = {
    favorites: readColors(item.favorites, 120),
    recent: readColors(item.recent, 60),
    sets: readColorSets(item.sets),
    gradients: readSavedGradients(item.gradients),
  };
  if ((item.sets as unknown[]).length && !result.sets.length ||
      (item.gradients as unknown[]).length && !result.gradients.length)
    throw new Error("No valid saved items");
  return result;
}
