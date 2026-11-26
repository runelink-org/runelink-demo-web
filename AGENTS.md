# Agent Guidelines

## Code Quality & Type Safety

- Always run checks in this order after making changes:
  1. `pnpm format` - Format code
  2. `pnpm lint` - Lint for potential issues
  3. `pnpm build` - Verify TypeScript compilation and bundling
- The current Vite build may emit an existing chunk-size warning; treat it as expected and do not call it out in summaries.
- Validate unknown types with Effect Schema instead of using `as any` or type assertions. Hoist decoders such as `Schema.decodeUnknownOption(Schema.fromJsonString(...))` to module level, and reuse the SDK's schemas for protocol data.

## Effect and State

- The app uses [Effect](https://effect.website) 4, pinned to the version the SDK uses. Follow the Effect conventions of [T3 Code](https://github.com/pingdotgg/t3code) where they fit.
- `RunelinkSession` (`src/lib/runelink-session.ts`) is the `Context.Service` that owns the active account's connection: one scope per connection, its stream listeners, reconnects, and authentication. Data modules call its `request` helper, and `src/lib/runtime.ts` provides it through a `ManagedRuntime`.
- App state lives in keep-alive atoms (`stateAtom`) in `appAtomRegistry`. Components read them with `useAtomValue(atom, selector)` from `@effect/atom-react`, and other code uses `getState` and `setState`. State that belongs to one account resets with `bindStoreToActiveAccount`.
- Write reusable effects with `Effect.fn("Module.operation")`, and expected failures as `Schema.TaggedError` classes with a user-facing `message`. Event handlers run effects with `runPromise` or `runPromiseExit` from `src/lib/runtime.ts`; `runPromise` rejects with the failure, so `error.message` can be shown directly.
- Tests run on `node:test` and load modules through Vite. Provide a test `RunelinkSession` layer rather than mocking modules.

## UI Components

- **Always default to shadcn/ui components** for all UI elements
- Use `pnpm dlx shadcn@latest add ...` to add new components if needed
- Maintain consistency with the existing design system and component patterns used in the project

## Best Practices

- Follow the existing project structure and conventions
- Ensure type safety throughout the codebase

## Runelink SDK

- The app depends on the published `@runelink/sdk` npm package.
- When a sibling `../runelink-sdk-js` checkout exists, Vite and TypeScript use its source instead, so local SDK changes apply without publishing. Run `pnpm install` in that checkout too, so TypeScript can resolve the SDK's dependencies. Otherwise, the installed package is used, as on Vercel.
- Local builds with the sibling checkout don't verify against the published package. The Vercel preview build is the authoritative check.
- Changes that need unreleased SDK features can only merge after that SDK version is published and the dependency is bumped here.
