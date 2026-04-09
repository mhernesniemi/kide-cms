# `@kidecms/core`

Kide's runtime and admin package.

## Install shape

The goal is to keep onboarding simple:

- `@kidecms/core` brings its own CMS runtime, generator, and admin UI dependencies.
- The host app provides `react` and `react-dom`.
- Some features are optional:
  - `@ai-sdk/openai` only when AI generation is enabled
  - `sharp` only when local image transforms are enabled

## Why some packages still exist in the app

Kide keeps project-specific code inside the app:

- database adapters
- storage adapters
- email adapters
- generated schema files
- framework route glue

Because those files live in the app, the app may still depend on packages like
`drizzle-orm`, `zod`, or `nanoid` when it imports them directly.

That is separate from `@kidecms/core`'s own package contract.
