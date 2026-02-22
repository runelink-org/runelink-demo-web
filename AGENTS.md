# Agent Guidelines

## Code Quality & Type Safety

- Always run checks in this order after making changes:
  1. `pnpm format` - Format code
  2. `pnpm lint` - Lint for potential issues
  3. `pnpm build` - Verify TypeScript compilation and bundling
- Validate unknown types with Zod schemas instead of using `as any` or type assertions
- Use React 19+ event types with proper generics: `React.FormEvent<HTMLFormElement>` instead of bare `React.FormEvent`

## UI Components

- **Always default to shadcn/ui components** for all UI elements
- Use `pnpm dlx shadcn@latest add ...` to add new components if needed
- Maintain consistency with the existing design system and component patterns used in the project

## Best Practices

- Follow the existing project structure and conventions
- Ensure type safety throughout the codebase
