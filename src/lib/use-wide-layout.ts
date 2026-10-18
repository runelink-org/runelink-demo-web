import { useSyncExternalStore } from "react";

// Matches Tailwind's `lg` breakpoint, where the members pane fits beside the
// channel sidebar and messages
const wideLayoutQuery = window.matchMedia("(min-width: 64rem)");

function subscribeToWideLayout(onChange: () => void): () => void {
  wideLayoutQuery.addEventListener("change", onChange);
  return () => wideLayoutQuery.removeEventListener("change", onChange);
}

function getIsWideLayout(): boolean {
  return wideLayoutQuery.matches;
}

export function useIsWideLayout(): boolean {
  return useSyncExternalStore(subscribeToWideLayout, getIsWideLayout);
}
