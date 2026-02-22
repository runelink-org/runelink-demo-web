# Agent Guidelines

## Code Quality & Formatting
- Always run `pnpm format` after making changes.
- Validate unknown types with Zod schemas instead of using `as any` or type assertions.

## UI Components
- **Always default to shadcn/ui components** for all UI elements.
- Use `pnpm dlx shadcn@latest add ...` to add new components if needed.
- Maintain consistency with the existing design system and component patterns used in the project.

## Best Practices
- Follow the existing project structure and conventions.
- Ensure type safety throughout the codebase.
- Test changes by building the project before considering them complete.
