# Development Workflow

## Build & Run

- Runtime: Node 22+ (keep Node + Bun paths working)
- Package manager: pnpm (prefer Bun for TypeScript execution)
- Install: `pnpm install`
- Build: `pnpm build`
- Dev: `pnpm openclaw ...` or `pnpm dev`
- Type-check: `pnpm tsgo`
- Lint/format: `pnpm check`
- Format fix: `pnpm format:fix`

## Testing Workflow

- Unit tests: `pnpm test` (vitest)
- Coverage: `pnpm test:coverage`
- E2E: `pnpm test:e2e`
- Live tests: `OPENCLAW_LIVE_TEST=1 pnpm test:live`
- Docker tests: `pnpm test:docker:all`
- Always run tests after code changes when test infra exists

## Multi-Agent Safety

- Do NOT create/apply/drop git stash entries unless explicitly requested
- Do NOT switch branches unless explicitly requested
- Do NOT create/remove git worktrees unless explicitly requested
- When you see unrecognized files, keep going; focus on your changes
- Scope commits to your changes only unless told to "commit all"

## Channels & Extensions

- Always consider ALL built-in + extension channels when refactoring shared logic
- Core channels: `src/telegram`, `src/discord`, `src/slack`, `src/signal`, `src/imessage`, `src/web`
- Extensions: `extensions/*`
- Plugin deps go in extension `package.json`, not root
- When adding channels/extensions, update `.github/labeler.yml`

## Docs

- Hosted on Mintlify (docs.openclaw.ai)
- Internal links: root-relative, no `.md`/`.mdx` suffix
- Avoid em dashes and apostrophes in headings (breaks Mintlify anchors)
- Docs content must be generic: no personal device names/hostnames/paths
