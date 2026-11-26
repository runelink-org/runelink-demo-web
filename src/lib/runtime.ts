import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Socket from "effect/socket/Socket";
import {
  checkSavedAccounts,
  setAccountDeletedNotifier,
} from "@/lib/account-deletion";
import * as RunelinkSession from "@/lib/runelink-session";

// Saved accounts are checked after startup so the check never delays loading.
const SAVED_ACCOUNT_CHECK_DELAY_MS = 3_000;

const runtime = ManagedRuntime.make(
  RunelinkSession.layer.pipe(
    Layer.provide(Socket.layerWebSocketConstructorGlobal)
  )
);

// Runs an effect from an event handler. Failures reject with the error.
export const runPromise = runtime.runPromise;
export const runPromiseExit = runtime.runPromiseExit;
export const runFork = runtime.runFork;

let started = false;

// Connects the active account, and reports saved accounts that were deleted.
export function startApp(notifyAccountDeleted: (account: string) => void) {
  setAccountDeletedNotifier(notifyAccountDeleted);
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
