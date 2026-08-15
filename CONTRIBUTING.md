# Contributing

Kide's core is constrained by design. That shapes how contributions work:

- **Bug fixes and docs** - open a PR.
- **New features** - open an issue first, before writing code. Some ideas fit better as a starter, a docs recipe, or your own project code than in core.

## Setup

```bash
pnpm install
pnpm dev
```

See [CLAUDE.md](CLAUDE.md) for the full repo map, conventions, and dual-distribution details.

## Before opening a PR

```bash
pnpm check   # astro check + Cloudflare TS profile + eslint
pnpm test    # unit + generator golden + in-memory DB integration
pnpm format  # prettier - run last
```

If your change touches `src/cms/platform/`, `src/cms/middleware/`, or the request-scope/task-queue machinery, also run `pnpm test:workers`.

CI runs the full gate (including package-mode and Cloudflare assembly) on every PR, the above just catches the same issues locally faster.

## Commit messages

Plain and descriptive is fine. No enforced convention.
