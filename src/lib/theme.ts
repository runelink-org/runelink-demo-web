import { z } from "zod";
import { create } from "zustand";

const THEME_STORAGE_KEY = "runelink.demo.theme";
const ThemePreferenceSchema = z.enum(["light", "dark", "system"]);

export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;
export type ResolvedTheme = "light" | "dark";

type ThemeState = {
  selectedTheme: ThemePreference;
  systemTheme: ResolvedTheme;
  setSelectedTheme: (theme: ThemePreference) => void;
};

let isThemeStoreInitialized = false;

function canUseThemeDom(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function loadStoredTheme(): ThemePreference {
  if (!canUseThemeDom()) {
    return "system";
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  const parsedTheme = ThemePreferenceSchema.safeParse(storedTheme);

  return parsedTheme.success ? parsedTheme.data : "system";
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

  document.documentElement.classList.toggle(
    "dark",
    resolveTheme(selectedTheme, systemTheme) === "dark"
  );
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  selectedTheme: "system",
  systemTheme: "light",
  setSelectedTheme(theme) {
    saveStoredTheme(theme);
    set({ selectedTheme: theme });
    applyTheme(theme, get().systemTheme);
  },
}));

export function initializeThemeStore(): void {
  if (!canUseThemeDom() || isThemeStoreInitialized) {
    return;
  }

  isThemeStoreInitialized = true;

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function syncThemeFromEnvironment(): void {
    const selectedTheme = loadStoredTheme();
    const systemTheme = mediaQuery.matches ? "dark" : "light";

    useThemeStore.setState({ selectedTheme, systemTheme });
    applyTheme(selectedTheme, systemTheme);
  }

  syncThemeFromEnvironment();

  mediaQuery.addEventListener("change", () => {
    const systemTheme = mediaQuery.matches ? "dark" : "light";
    const selectedTheme = useThemeStore.getState().selectedTheme;

    useThemeStore.setState({ systemTheme });
    applyTheme(selectedTheme, systemTheme);
  });
}
