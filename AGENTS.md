# Agent Guidelines

## Code Quality & Type Safety

- Always run checks in this order after making changes:
  1. `pnpm format` - Format code
  2. `pnpm lint` and `pnpm lint:effect` - Check source and Effect diagnostics
  3. `pnpm build` - Verify TypeScript compilation and bundling
  4. `pnpm test` - Run the tests
- The current Vite build may emit an existing chunk-size warning; treat it as expected and do not call it out in summaries.
- Validate unknown types with Effect Schema instead of using `as any` or type assertions. Hoist decoders such as `Schema.decodeUnknownOption(Schema.fromJsonString(...))` to module level, and reuse the SDK's schemas for protocol data.

## Effect

Read [the Effect conventions](docs/effect-conventions.md) before changing Effect code. In correctness and simplicity reviews, check the changed lines against that guide.

## UI Components

- **Always default to shadcn/ui components** for all UI elements
- Use `pnpm dlx shadcn@latest add ...` to add new components if needed
- Maintain consistency with the existing design system and component patterns used in the project

## Best Practices

- Follow the existing project structure and conventions
- Ensure type safety throughout the codebase

## Runelink SDK

- The app depends on the published `@runelink/sdk` npm package. Keep `effect` pinned to the SDK's Effect version.
- When a sibling `../runelink-sdk-js` checkout exists, Vite and TypeScript use its source instead, so local SDK changes apply without publishing. Run `pnpm install` in that checkout too, so TypeScript can resolve the SDK's dependencies. Otherwise, the installed package is used, as on Vercel.
- Local builds with the sibling checkout don't verify against the published package. The Vercel preview build is the authoritative check.
- Changes that need unreleased SDK features can only merge after that SDK version is published and the dependency is bumped here.
