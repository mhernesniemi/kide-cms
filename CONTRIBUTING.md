# Contributing

Kide's core is constrained by design. That shapes how contributions work:

- **Bug fixes, hardening existing features, and docs** - open a PR. Refining what's already here is especially welcome.
- **New features** - open an issue first. Some ideas can fit better as a starter, a docs recipe, or your own project code than in core.

## Setup

```bash
pnpm install
pnpm dev
```

## Before opening a PR

```bash
pnpm check   # astro check + Cloudflare TS profile + eslint
pnpm test    # unit tests + generated-code snapshot checks + in-memory DB integration tests
pnpm format  # prettier (should run last)
```

If your change touches `src/cms/platform/`, `src/cms/middleware/`, or the request-scope/task-queue machinery, also run `pnpm test:workers`.

CI runs the full gate (including package-mode and Cloudflare assembly) on every PR, the above just catches the same issues locally faster.

## Commit messages

Plain and descriptive is fine. No enforced convention.
