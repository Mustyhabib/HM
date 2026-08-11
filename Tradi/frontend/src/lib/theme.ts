/**
 * Theme hook — light / dark mode.
 *
 * Reads the current theme from the `data-theme` attribute that `theme-boot.js`
 * applies before first paint. Toggling writes back to the DOM, localStorage,
 * and React state atomically so there's no flicker.
 */
import { useCallback, useState } from "react";

export type Theme = "dark" | "light";
const STORAGE_KEY = "hm-theme";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(
    () =>
      (document.documentElement.getAttribute("data-theme") as Theme | null) ??
      "dark",
  );

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";

    // Drive all three concurrently so no class/attr flickers independently.
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.style.colorScheme = next;
    document.documentElement.classList.toggle("dark", next === "dark");

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Restricted iframe — best-effort.
    }

    setTheme(next);
  }, [theme]);

  return { theme, toggle };
}
