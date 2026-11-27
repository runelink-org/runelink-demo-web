import * as Effect from "effect/Effect";
import type * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Socket from "effect/socket/Socket";
import {
  checkSavedAccounts,
  setAccountDeletedNotifier,
} from "@/lib/account-deletion";
import * as RunelinkSession from "@/lib/runelink-session";
import {
  handleRunelinkUpdate,
  setUpdateNotifier,
} from "@/lib/runelink-updates";

// Saved accounts are checked after startup so the check never delays loading.
const SAVED_ACCOUNT_CHECK_DELAY_MS = 3000;

const runtime = ManagedRuntime.make(
  RunelinkSession.layer(handleRunelinkUpdate).pipe(
    Layer.provide(Socket.layerWebSocketConstructorGlobal)
  )
);

// Run effects from event handlers and React effects. They only take effects
// whose failures are all handled, so the compiler checks that every failure
// case has a handler.
export function runPromise<A>(
  effect: Effect.Effect<A, never, RunelinkSession.RunelinkSession>
): Promise<A> {
  return runtime.runPromise(effect);
}

export function runFork<A>(
  effect: Effect.Effect<A, never, RunelinkSession.RunelinkSession>
): Fiber.Fiber<A> {
  return runtime.runFork(effect);
}

let started = false;

// Connects the active account, and shows notices such as for saved accounts
// that were deleted.
export function startApp(notify: (message: string) => void) {
  setAccountDeletedNotifier((account) => {
    notify(`${account} was deleted.`);
  });
  setUpdateNotifier(notify);
  if (started) return;
  started = true;
  runFork(
    Effect.gen(function* () {
      yield* RunelinkSession.RunelinkSession;
      yield* Effect.sleep(SAVED_ACCOUNT_CHECK_DELAY_MS);
      yield* checkSavedAccounts;
    })
  );
}
