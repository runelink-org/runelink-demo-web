import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { getState, setState, stateAtom } from "@/lib/atom-registry";

const THEME_STORAGE_KEY = "runelink.demo.theme";
const ThemePreferenceSchema = Schema.Literals(["light", "dark", "system"]);
const decodeThemePreference = Schema.decodeUnknownOption(ThemePreferenceSchema);
// Matches --background in index.css.
const THEME_COLORS = { light: "#ffffff", dark: "#171717" };

type ThemePreference = typeof ThemePreferenceSchema.Type;
type ResolvedTheme = "light" | "dark";

type ThemeState = {
  selectedTheme: ThemePreference;
  systemTheme: ResolvedTheme;
};

export const themeAtom = stateAtom<ThemeState>({
  selectedTheme: "system",
  systemTheme: "light",
});

let isThemeStoreInitialized = false;

function canUseThemeDom(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function loadStoredTheme(): ThemePreference {
  if (!canUseThemeDom()) {
    return "system";
  }

  return Option.getOrElse(
    decodeThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY)),
    () => "system" as const
  );
}

function saveStoredTheme(theme: ThemePreference): void {
  if (!canUseThemeDom()) {
    return;
  }

  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function resolveTheme(
  selectedTheme: ThemePreference,
  systemTheme: ResolvedTheme
): ResolvedTheme {
  return selectedTheme === "system" ? systemTheme : selectedTheme;
}

function applyTheme(
  selectedTheme: ThemePreference,
  systemTheme: ResolvedTheme
): void {
  if (!canUseThemeDom()) {
    return;
  }

  const resolvedTheme = resolveTheme(selectedTheme, systemTheme);

  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) =>
      meta.setAttribute("content", THEME_COLORS[resolvedTheme])
    );
}

export function setSelectedTheme(theme: ThemePreference): void {
  saveStoredTheme(theme);
  setState(themeAtom, { selectedTheme: theme });
  applyTheme(theme, getState(themeAtom).systemTheme);
}

export function initializeThemeStore(): void {
  if (!canUseThemeDom() || isThemeStoreInitialized) {
    return;
  }

  isThemeStoreInitialized = true;

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function syncThemeFromEnvironment(): void {
    const selectedTheme = loadStoredTheme();
    const systemTheme = mediaQuery.matches ? "dark" : "light";

    setState(themeAtom, { selectedTheme, systemTheme });
    applyTheme(selectedTheme, systemTheme);
  }

  syncThemeFromEnvironment();

  mediaQuery.addEventListener("change", () => {
    const systemTheme = mediaQuery.matches ? "dark" : "light";
    const selectedTheme = getState(themeAtom).selectedTheme;

    setState(themeAtom, { systemTheme });
    applyTheme(selectedTheme, systemTheme);
  });
}
