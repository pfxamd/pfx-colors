import { useEffect, useState } from "react";
import { readThemePreference, resolveTheme, THEME_KEY, type ThemePreference } from "./theme";

const mediaQuery = "(prefers-color-scheme: dark)";

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() =>
    readThemePreference(typeof window === "undefined" ? null : window.localStorage));
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(mediaQuery).matches);

  useEffect(() => {
    const media = window.matchMedia(mediaQuery);
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const theme = resolveTheme(preference, systemDark);
  useEffect(() => {
    document.documentElement.dataset.pfxTheme = theme;
    document.documentElement.style.colorScheme = theme;
    try { window.localStorage.setItem(THEME_KEY, preference); } catch { /* private mode */ }
  }, [preference, theme]);

  return { preference, setPreference, theme };
}
