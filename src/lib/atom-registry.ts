import { RegistryContext } from "@effect/atom-react";
import * as Atom from "effect/reactivity/Atom";
import * as AtomRegistry from "effect/reactivity/AtomRegistry";
import { createElement } from "react";
import type { PropsWithChildren } from "react";

// App state lives in atoms in this registry, so code outside React reads and
// updates the same values that components render.
export const appAtomRegistry = AtomRegistry.make();

export function AppAtomRegistryProvider({ children }: PropsWithChildren) {
  return createElement(
    RegistryContext.Provider,
    { value: appAtomRegistry },
    children
  );
}

// A state atom that keeps its value while no component reads it
export function stateAtom<S>(initial: S): Atom.Writable<S> {
  return Atom.make(initial).pipe(Atom.keepAlive);
}

export function getState<S>(atom: Atom.Atom<S>): S {
  return appAtomRegistry.get(atom);
}

// Merges a partial state, like a Zustand `set`
export function setState<S>(
  atom: Atom.Writable<S>,
  patch: Partial<S> | ((state: S) => Partial<S>)
): void {
  appAtomRegistry.update(atom, (state) => ({
    ...state,
    ...(typeof patch === "function" ? patch(state) : patch),
  }));
}
