# @kidecms/core

The runtime behind [Kide CMS](https://github.com/mhernesniemi/kide-cms) — a code-first CMS built for Astro. Define collections in TypeScript, get a generated admin UI and typed content API.

You normally don't install this package directly. Scaffold a project with:

```bash
pnpx create-kide-app
```

and choose **Package** mode when asked how you want the CMS runtime — `create-kide-app` adds `@kidecms/core` as a dependency and wires everything up. **Embedded** mode vendors this same source into your project instead, no npm dependency involved.

## Links

- [Docs](https://docs.kide.dev/)
- [Live demo](https://demo.kide.dev/admin)
- [Source & issues](https://github.com/mhernesniemi/kide-cms)
- [Changelog](https://github.com/mhernesniemi/kide-cms/blob/main/CHANGELOG.md)

## What's in the box

Admin UI, typed local API, auth, assets, search, webhooks, background tasks, collaboration workflow, and the `kide` CLI (`kide generate|push|seed|admin|upgrade|eject|mcp`). See the [full feature list and quick start](https://github.com/mhernesniemi/kide-cms#readme) in the main repo.

## License

MIT
