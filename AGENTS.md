# Agent Guidelines

## Code Quality & Type Safety

- Always run checks in this order after making changes:
  1. `pnpm format` - Format code
  2. `pnpm lint` - Lint for potential issues
  3. `pnpm build` - Verify TypeScript compilation and bundling
- The current Vite build may emit an existing chunk-size warning; treat it as expected and do not call it out in summaries.
- Validate unknown types with Zod schemas instead of using `as any` or type assertions
- Use React 19+ event types with proper generics: `React.FormEvent<HTMLFormElement>` instead of bare `React.FormEvent`

## UI Components

- **Always default to shadcn/ui components** for all UI elements
- Use `pnpm dlx shadcn@latest add ...` to add new components if needed
- Maintain consistency with the existing design system and component patterns used in the project

## Best Practices

- Follow the existing project structure and conventions
- Ensure type safety throughout the codebase

## Vendored Repositories

- Treat vendored Git repositories as submodules. Do not manually copy or edit their files to update them to an upstream commit.
- When the relevant upstream work is on the currently tracked branch, update the vendored repository with `git submodule update --remote <path>`.
- When the relevant upstream work is on another branch, use `git submodule set-branch --branch <branch> <path>` followed by `git submodule update --remote <path>`.
- When returning a vendored repository from a child branch to a parent branch, use `git submodule set-branch --branch <parent-branch> <path>` followed by `git submodule update --remote <path>`.
- After updating, verify that the submodule worktree is clean and that the parent repository records only the intended submodule commit change.
