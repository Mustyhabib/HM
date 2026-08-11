(() => {
  const root = document.documentElement;
  let saved = null;

  try {
    saved = window.localStorage.getItem("hm-theme");
  } catch {
    // Storage unavailable in restricted iframes / WebViews.
  }

  let prefersDark = false;
  if (saved !== "dark" && saved !== "light" && typeof window.matchMedia === "function") {
    try {
      prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      // Fall back to dark when matchMedia is unavailable.
      prefersDark = true;
    }
  }

  const dark = saved === "dark" || (saved !== "light" && prefersDark);
  const theme = dark ? "dark" : "light";

  // data-theme drives CSS custom-property overrides (our token system).
  root.setAttribute("data-theme", theme);
  // colorScheme drives the browser's native UI (scrollbars, form controls).
  root.style.colorScheme = theme;
  // .dark drives Tailwind's darkMode:"class" variants.
  root.classList.toggle("dark", dark);
})();
