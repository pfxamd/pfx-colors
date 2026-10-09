import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

export function readStored<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
  try {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed) ? parsed : fallback;
  } catch { return fallback; }
}

export function useStoredState<T>(
  key: string, fallback: T, valid: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readStored(key, fallback, valid));
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(value)); }
    catch { /* Storage may be unavailable or full. */ }
  }, [key, value]);
  return [value, setValue];
}

export const isHex = (value: unknown): value is string =>
  typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value);

export const numberBetween = (min: number, max: number) => (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

export function oneOf<const T extends string>(values: readonly T[]) {
  return (value: unknown): value is T => typeof value === "string" && values.includes(value as T);
}
