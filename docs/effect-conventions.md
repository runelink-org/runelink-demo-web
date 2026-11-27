# Effect conventions

A matching copy lives in `runelink-sdk-js/docs/effect-conventions.md`. Update the shared section in both repositories together.

## Shared conventions

- Keep pure, total work in plain functions. When a synchronous API throws and absence is all callers need, use `Option.liftThrowable` at the smallest boundary. For fallible I/O or failures callers need to distinguish, use `Effect.try` or `Effect.tryPromise` with a typed mapper. Use an Effect-native API when it preserves behavior.
- Put expected failures in the error channel as `Schema.TaggedError` classes. Give callers distinct tags when they need different recovery, and use structured fields for details that do not change control flow. Map at the boundary where the context is known. Pass through a domain error already in the target channel. Use `Effect.catchTags` for known tags and whole-channel recovery only where all failures really receive the same treatment.
- Derive error messages from safe, bounded fields. Never include credentials, raw wire payloads, URL queries, or arbitrary defect text in messages or annotations. Keep a wrapped cause only when it is safe to carry. Some browser socket errors can retain a socket URL, so preserving an unsanitized cause is not always safe.
- Keep service shape and construction together. Define the interface inline on `Context.Service`. Acquire dependencies from the environment and expose their requirements in `make` and `layer`. Compose layers at the application boundary and scope resources to the operation that owns them. Import Effect modules from subpaths as namespaces. Hoist schema decoders that are reused.
- Name reusable Effect operations with `Effect.fn("Service.operation")`. A stable name is useful in logs and traces. Keep `Effect.gen` for inline programs and layer construction. Use `Effect.fnUntraced` for hot paths or operations already covered by a span, with a nearby reason if it is not obvious.
- Run effects at named integration boundaries, such as React event handlers or a CLI entry point. Services return effects instead of starting a second runtime. In tests, use `@effect/vitest`, test layers for external dependencies, and the test clock when behavior depends on time.

Run `pnpm lint` and `pnpm lint:effect`. Review changed lines for the design decisions above, especially what callers must distinguish, who owns the dependency or scope, and whether an error or cause can leak data.

## Demo app

`RunelinkSession` owns the active account's connection, reconnects, listeners, and authentication. `src/lib/runtime.ts` supplies the application runtime. Its React adapters accept effects with no unhandled failures. The runtime passes the update handler to the session layer so the session does not import the stores that consume its updates. Surface user-action failures with a toast or inline message and handle background failures where the data appears or in logs.

App state uses keep-alive atoms in `appAtomRegistry`. Read them through `useAtomValue` in components and use `getState` and `setState` elsewhere. Reset account-owned state with `bindStoreToActiveAccount`. Provide a test `RunelinkSession` layer instead of mocking modules.
