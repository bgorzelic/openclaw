# Security Rules

## Secrets

- NEVER commit `.env`, `credentials.json`, API keys, or tokens
- Use `.env.example` for documentation only (no real values)
- Never embed real phone numbers, videos, or live config values in code/docs
- Use obviously fake placeholders in tests and examples

## Dependencies

- Never update the Carbon dependency
- Any dependency with `pnpm.patchedDependencies` must use exact version (no `^`/`~`)
- Patching dependencies (pnpm patches, overrides, vendored changes) requires explicit approval
- Never add deps to root `package.json` unless core uses them; plugin deps go in extension `package.json`

## Input Validation

- Validate all API inputs with Zod or TypeBox
- Sanitize user-generated content
- Use parameterized queries (never string interpolation)

## Tool Schemas

- Avoid `Type.Union` in tool input schemas; no `anyOf`/`oneOf`/`allOf`
- Use `stringEnum`/`optionalStringEnum` for string lists
- Avoid raw `format` property names in tool schemas (reserved keyword)

## Release

- Never change version numbers without explicit consent
- Never run npm publish/release steps without explicit approval
- Never commit or publish real phone numbers, videos, or live configuration values
