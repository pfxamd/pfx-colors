import { useCallback, useState } from "react";
import { normalizeHex } from "./color-library";
import {
  readColorSets, readSavedGradients, readColors,
  type LibrarySnapshot, type SavedColorSet, type SavedGradient,
} from "./library-backup";
import type { SavedGradientDraft } from "./gradient-session";

const favoriteKey = "pfx-colors.favorites.v2";
const recentKey = "pfx-colors.recent.v2";
const setsKey = "pfx-colors.sets.v2";
const gradientsKey = "pfx-colors.gradients.v1";
export type { SavedColorSet, SavedGradient };

function stored(key: string): unknown {
  try { return JSON.parse(window.localStorage.getItem(key) ?? "[]"); }
  catch { return []; }
}

function persist<T>(key: string, values: readonly T[]): void {
  try { window.localStorage.setItem(key, JSON.stringify(values)); }
  catch { /* Storage may be unavailable. */ }
}

function newId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function mergeById<T extends { id: string }>(
  current: readonly T[], imported: readonly T[], limit: number,
): T[] {
  const seen = new Set<string>();
  return [...current, ...imported].filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, limit);
}

export function useColorLibrary() {
  const [favorites, setFavorites] = useState<string[]>(() => readColors(stored(favoriteKey), 120));
  const [recent, setRecent] = useState<string[]>(() => readColors(stored(recentKey), 60));
  const [sets, setSets] = useState<SavedColorSet[]>(() => readColorSets(stored(setsKey)));
  const [gradients, setGradients] = useState<SavedGradient[]>(() => readSavedGradients(stored(gradientsKey)));

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
    const colors = readColors(raw, 16);
    if (!colors.length) return;
    const item: SavedColorSet = {
      id: newId(), name: name.trim().slice(0, 60) || "Untitled set",
      colors, created: Date.now(),
    };
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

  const saveGradient = useCallback((name: string, gradient: SavedGradientDraft) => {
    const item: SavedGradient = {
      id: newId(), name: name.trim().slice(0, 60) || "Untitled gradient",
      created: Date.now(), gradient,
    };
    setGradients(previous => {
      const next = [item, ...previous].slice(0, 40);
      persist(gradientsKey, next);
      return next;
    });
  }, []);

  const removeGradient = useCallback((id: string) => {
    setGradients(previous => {
      const next = previous.filter(item => item.id !== id);
      persist(gradientsKey, next);
      return next;
    });
  }, []);

  const restoreBackup = useCallback((backup: LibrarySnapshot) => {
    setFavorites(previous => {
      const next = readColors([...previous, ...backup.favorites], 120);
      persist(favoriteKey, next);
      return next;
    });
    setRecent(previous => {
      const next = readColors([...previous, ...backup.recent], 60);
      persist(recentKey, next);
      return next;
    });
    setSets(previous => {
      const next = mergeById(previous, backup.sets, 40);
      persist(setsKey, next);
      return next;
    });
    setGradients(previous => {
      const next = mergeById(previous, backup.gradients, 40);
      persist(gradientsKey, next);
      return next;
    });
  }, []);

  return {
    favorites, recent, sets, gradients,
    toggleFavorite, addRecent, clearRecent, saveSet, removeSet,
    saveGradient, removeGradient, restoreBackup,
  };
}
