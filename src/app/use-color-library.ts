import { useCallback, useState } from "react";
import { normalizeHex } from "./color-library";

const favoriteKey = "pfx-colors.favorites.v2";
const recentKey = "pfx-colors.recent.v2";
const setsKey = "pfx-colors.sets.v2";
export type SavedColorSet = { id: string; name: string; colors: string[]; created: number };

function readSets(): SavedColorSet[] {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(setsKey) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 40).flatMap((value: unknown) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Partial<SavedColorSet>;
      if (typeof item.id !== "string" || typeof item.name !== "string" ||
          !Array.isArray(item.colors) || typeof item.created !== "number") return [];
      const colors = item.colors.slice(0, 16).map((hex: unknown) =>
        typeof hex === "string" ? normalizeHex(hex) : null)
        .filter((hex): hex is string => hex !== null);
      if (!colors.length) return [];
      return [{ id: item.id.slice(0, 80), name: item.name.slice(0, 60),
        colors, created: item.created }];
    });
  } catch { return []; }
}


function readList(key: string): string[] {
  try {
    const json = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(json)) return [];
    return [...new Set(json.map((value: unknown) =>
      typeof value === "string" ? normalizeHex(value) : null).filter((value): value is string => value !== null))].slice(0, 120);
  } catch {
    return [];
  }
}

function persist<T>(key: string, values: readonly T[]): void {
  try { window.localStorage.setItem(key, JSON.stringify(values)); } catch { /* storage unavailable */ }
}

export function useColorLibrary() {
  const [favorites, setFavorites] = useState<string[]>(() => readList(favoriteKey));
  const [recent, setRecent] = useState<string[]>(() => readList(recentKey));
  const [sets, setSets] = useState<SavedColorSet[]>(readSets);

  const toggleFavorite = useCallback((raw: string) => {
    const hex = normalizeHex(raw);
    if (!hex) return;
    setFavorites(previous => {
      const next = previous.includes(hex) ? previous.filter(v => v !== hex) : [hex, ...previous].slice(0, 120);
      persist(favoriteKey, next);
      return next;
    });
  }, []);

  const addRecent = useCallback((raw: string) => {
    const hex = normalizeHex(raw);
    if (!hex) return;
    setRecent(previous => {
      const next = [hex, ...previous.filter(v => v !== hex)].slice(0, 60);
      persist(recentKey, next);
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setRecent([]);
    persist(recentKey, []);
  }, []);

  const saveSet = useCallback((name: string, raw: readonly string[]) => {
    const colors = raw.map(normalizeHex).filter((hex): hex is string => hex !== null).slice(0, 16);
    if (!colors.length) return;
    const item: SavedColorSet = { id: Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 8), name: name.trim().slice(0, 60) || "Untitled set",
      colors, created: Date.now() };
    setSets(previous => {
      const next = [item, ...previous].slice(0, 40);
      persist(setsKey, next);
      return next;
    });
  }, []);

  const removeSet = useCallback((id: string) => {
    setSets(previous => {
      const next = previous.filter(item => item.id !== id);
      persist(setsKey, next);
      return next;
    });
  }, []);

  return { favorites, recent, sets, toggleFavorite, addRecent, clearRecent, saveSet, removeSet };
}
