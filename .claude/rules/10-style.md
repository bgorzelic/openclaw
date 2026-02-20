# Style & Conventions

## TypeScript

- ESM modules only; strict typing; avoid `any`
- Never add `@ts-nocheck` or disable `no-explicit-any`
- Use `unknown` with type guards when type is uncertain
- Formatting/linting via Oxlint and Oxfmt (not ESLint/Prettier)
- Run `pnpm check` before commits

## Code Organization

- Keep files under ~500 LOC; split/refactor when it improves clarity
- Extract helpers instead of creating "V2" copies
- Use existing patterns for CLI options and dependency injection via `createDefaultDeps`
- Add brief comments for tricky or non-obvious logic

## Naming

- Product/app/docs headings: **OpenClaw**
- CLI command, package, paths, config keys: `openclaw`
- Files: kebab-case
- Functions/variables: camelCase
- Constants: UPPER_SNAKE_CASE
- Classes/types: PascalCase

## Imports

- Group: stdlib/node builtins -> external packages -> internal modules
- Named exports preferred over default exports
- Use `import type` for type-only imports

## Testing

- Framework: Vitest with V8 coverage (70% threshold)
- Match source names: `*.test.ts`; e2e in `*.e2e.test.ts`
- Run `pnpm test` before pushing when touching logic
- Prefer per-instance stubs over prototype mutation in tests

## Git & Commits

- Use `scripts/committer "<msg>" <file...>` for commits
- Concise, action-oriented messages (e.g., `CLI: add verbose flag to send`)
- Group related changes; avoid bundling unrelated refactors
- One PR = one issue/topic

## CLI Output

- Progress: use `src/cli/progress.ts` (osc-progress + @clack/prompts spinner)
- Status: use `src/terminal/table.ts` for tables + ANSI-safe wrapping
- Colors: use shared CLI palette in `src/terminal/palette.ts` (no hardcoded colors)

## Class Design

- Never share class behavior via prototype mutation
- Use explicit inheritance/composition so TypeScript can typecheck
