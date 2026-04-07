# create-kide-app

Scaffold a new [Kide CMS](https://github.com/mhernesniemi/kide-cms) project.

## Usage

```bash
npm create kide-app my-project
# or
pnpm create kide-app my-project
# or
bunx create-kide-app my-project
```

The CLI will guide you through:

1. **Project name** — directory to create
2. **Deploy target** — Local/Node.js or Cloudflare
3. **Demo content** — optionally seed the database

## What it does

- Downloads the latest Kide CMS template from GitHub
- Applies platform-specific configuration (Node.js adapter, Cloudflare D1/R2, etc.)
- Installs dependencies
- Generates the CMS schema
- Optionally seeds demo content

## Requirements

- Node.js >= 22.12.0
