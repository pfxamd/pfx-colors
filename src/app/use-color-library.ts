import { useCallback, useState } from "react";
import { normalizeHex } from "./color-library";

const favoriteKey = "pfx-colors.favorites.v2";
const recentKey = "pfx-colors.recent.v2";

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

function persist(key: string, values: string[]): void {
  try { window.localStorage.setItem(key, JSON.stringify(values)); } catch { /* storage unavailable */ }
}

export function useColorLibrary() {
  const [favorites, setFavorites] = useState<string[]>(() => readList(favoriteKey));
  const [recent, setRecent] = useState<string[]>(() => readList(recentKey));

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

  return { favorites, recent, toggleFavorite, addRecent, clearRecent };
}
