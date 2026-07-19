# Security Policy

## Dependency Boundary

The published Braingraph CLI intentionally has no runtime dependencies. `pnpm audit:prod` must remain clean at the `moderate` threshold. Development dependencies execute on maintainer machines and in CI, so `pnpm audit:dev` is also a required CI gate rather than being dismissed as irrelevant to production packaging.

When an advisory affects only an unused server or browser mode, record that narrower exposure in the remediation review, but still upgrade to a supported patched release when one exists. Keep paired packages such as Vitest and `@vitest/coverage-v8` on the same release line. Use a package-manager override only when a direct parent has not yet published a compatible patched resolution, and remove the override once the parent resolves it.

Dependabot checks npm and GitHub Actions weekly. Dependency pull requests must pass the native operating-system matrix, the packed-CLI smoke test, both audits, and the normal quality suite before merge.

## Reporting

Do not include credentials, private repository content, sensitive local paths, or raw user knowledge in a public report. Use fictional reproduction data and follow the structured issue format in the setup skill.
