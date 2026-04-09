#!/usr/bin/env node

import * as p from "@clack/prompts";
import { execSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "templates");

// Async spawn wrapper so long-running commands don't block clack spinners
const runAsync = (cmd, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, { cwd, shell: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else {
        const err = new Error(`Command failed: ${cmd}`);
        err.stderr = stderr;
        err.stdout = stdout;
        reject(err);
      }
    });
  });

// --- Package manager detection ---

const pm = { name: "pnpm", exec: "pnpm exec", dlx: "pnpm dlx", run: "pnpm", install: "pnpm install" };

// --- Main ---

async function main() {
  p.intro("🪐 Create Kide CMS Project");

  // 1. Project name
  const projectName =
    process.argv[2] ||
    (await p.text({
      message: "Project name",
      placeholder: "my-cms-app",
      validate: (value) => {
        if (!value) return "Project name is required";
      },
    }));

  if (p.isCancel(projectName)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const projectDir = path.resolve(process.cwd(), projectName);
  if (existsSync(projectDir)) {
    p.cancel(`Directory "${projectName}" already exists.`);
    process.exit(1);
  }

  // 2. Deploy target
  const target = await p.select({
    message: "Where will you deploy?",
    options: [
      { label: "Local / Node.js", value: "local" },
      { label: "Cloudflare", value: "cloudflare" },
    ],
  });

  if (p.isCancel(target)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  // 3. Demo content (local only — Cloudflare uses remote D1)
  let seedDemo = false;
  if (target === "local") {
    const seed = await p.confirm({
      message: "Seed database with demo content?",
      initialValue: false,
    });

    if (p.isCancel(seed)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }
    seedDemo = seed;
  }

  const s = p.spinner();

  // --- Scaffold from base template ---

  s.start(`Scaffolding project (using ${pm.name})`);

  cpSync(path.join(TEMPLATES_DIR, "base"), projectDir, { recursive: true });

  // Rename gitignore → .gitignore (npm strips dotfiles from published tarballs)
  const gitignoreSrc = path.join(projectDir, "gitignore");
  if (existsSync(gitignoreSrc)) {
    cpSync(gitignoreSrc, path.join(projectDir, ".gitignore"));
    rmSync(gitignoreSrc);
  }

  // Apply demo schema and seed data if selected
  if (seedDemo) {
    cpSync(path.join(TEMPLATES_DIR, "demo"), projectDir, { recursive: true });
  }

  s.stop("Project scaffolded");

  // --- Apply target-specific files ---

  s.start(`Applying ${target} configuration`);

  const targetDir = path.join(TEMPLATES_DIR, target);

  cpSync(path.join(targetDir, "astro.config.mjs"), path.join(projectDir, "astro.config.mjs"));
  cpSync(path.join(targetDir, "db.ts"), path.join(projectDir, "src/cms/adapters/db.ts"));
  cpSync(path.join(targetDir, "drizzle.config.ts"), path.join(projectDir, "drizzle.config.ts"));

  if (target === "cloudflare") {
    cpSync(path.join(targetDir, "storage.ts"), path.join(projectDir, "src/cms/adapters/storage.ts"));
    const uploadsRouteDir = path.join(projectDir, "src/pages/uploads");
    mkdirSync(uploadsRouteDir, { recursive: true });
    cpSync(path.join(targetDir, "uploads-route.ts"), path.join(uploadsRouteDir, "[...path].ts"));
  }

  const pkgPath = path.join(projectDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

  pkg.name = projectName;

  if (seedDemo) {
    pkg.scripts["cms:seed"] = "node --import tsx src/cms/internals/seed.ts";
  }

  if (target === "cloudflare") {
    delete pkg.dependencies["@astrojs/node"];
    pkg.dependencies["@astrojs/cloudflare"] = "^13.0.0";
    // libsql is for local target only; Cloudflare uses D1 directly
    delete pkg.dependencies["@libsql/client"];
    delete pkg.dependencies["sharp"];

    let wranglerContent = readFileSync(path.join(targetDir, "wrangler.toml"), "utf-8");
    wranglerContent = wranglerContent.replaceAll("{{PROJECT_NAME}}", projectName);
    writeFileSync(path.join(projectDir, "wrangler.toml"), wranglerContent);

    pkg.devDependencies.wrangler = "^4.0.0";

    pkg.scripts.dev = "astro dev";
    pkg.scripts.build = "astro build";
    pkg.scripts.preview = "astro build && wrangler dev --config dist/server/wrangler.json";
    pkg.scripts.deploy = "astro build && wrangler deploy --config dist/server/wrangler.json";
  }

  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  if (target === "cloudflare") {
    const gitignorePath = path.join(projectDir, ".gitignore");
    const gitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf-8") : "";
    writeFileSync(gitignorePath, gitignore + "\n# Cloudflare\n.wrangler/\n");
  }

  s.stop("Configuration applied");

  // --- Install dependencies ---

  s.start("Installing dependencies");
  try {
    await runAsync(pm.install, projectDir);
    s.stop("Dependencies installed");
  } catch {
    s.stop(`${pm.install} failed — run it manually`);
  }

  // --- Initialize git repository ---

  let gitInitialized = false;
  try {
    execSync("git init -q && git add . && git commit -q -m 'Initial commit from create-kide-app'", {
      cwd: projectDir,
      stdio: "pipe",
    });
    gitInitialized = true;
  } catch {
    // git not available — silently skip
  }

  // --- Optional: create GitHub repository ---

  if (gitInitialized) {
    let ghAvailable = false;
    try {
      execSync("gh --version", { stdio: "pipe" });
      execSync("gh auth status", { stdio: "pipe" });
      ghAvailable = true;
    } catch {
      // gh not installed or not authenticated — skip the prompt
    }

    if (ghAvailable) {
      const createRepo = await p.confirm({
        message: "Create a GitHub repository for this project?",
        initialValue: false,
      });
      if (!p.isCancel(createRepo) && createRepo) {
        // Get the GitHub username so we can check repo availability
        let ghUser = "";
        try {
          ghUser = execSync("gh api user --jq .login", { stdio: "pipe" }).toString().trim();
        } catch {}

        // Prompt for repo name, validate it doesn't already exist
        let repoName = null;
        while (true) {
          const input = await p.text({
            message: "Repository name",
            initialValue: projectName,
            validate: (value) => {
              if (!value) return "Repository name is required";
              if (!/^[a-zA-Z0-9._-]+$/.test(value)) return "Only letters, numbers, dots, hyphens, and underscores";
            },
          });
          if (p.isCancel(input)) break;

          // Check if repo already exists under the user's account
          if (ghUser) {
            try {
              execSync(`gh repo view ${ghUser}/${input}`, { stdio: "pipe" });
              p.note(`A repository named "${input}" already exists. Pick a different name.`, "Name taken");
              continue;
            } catch {
              // Repo doesn't exist — name is free
            }
          }
          repoName = input;
          break;
        }

        if (repoName) {
          const visibility = await p.select({
            message: "Repository visibility",
            options: [
              { label: "Private", value: "--private" },
              { label: "Public", value: "--public" },
            ],
          });
          if (!p.isCancel(visibility)) {
            s.start("Creating GitHub repository");
            try {
              execSync(`gh repo create ${repoName} ${visibility} --source=. --push`, {
                cwd: projectDir,
                stdio: "pipe",
              });
              s.stop("GitHub repository created and pushed");
            } catch (err) {
              s.stop("GitHub repository creation failed");
              if (err.stderr) console.error(err.stderr.toString().slice(-500));
            }
          }
        }
      }
    }
  }

  // --- Generate schema ---

  s.start("Generating CMS schema");
  try {
    execSync(`${pm.run} cms:generate`, { cwd: projectDir, stdio: "pipe" });
    s.stop("Schema generated");
  } catch {
    s.stop("Schema generation failed — run `cms:generate` manually");
  }

  // --- Seed demo content ---

  if (seedDemo && target === "local") {
    s.start("Pushing schema to database");
    try {
      execSync(`${pm.exec} drizzle-kit push --force`, { cwd: projectDir, stdio: "pipe" });
      s.stop("Schema pushed");
    } catch {
      s.stop("Schema will be set up on first dev start");
    }
    s.start("Seeding demo content");
    try {
      execSync(`${pm.run} cms:seed`, { cwd: projectDir, stdio: "pipe" });
      s.stop("Demo content seeded");
    } catch (err) {
      s.stop("Seeding failed — run `pnpm cms:seed` manually");
      if (err.stderr) console.error(err.stderr.toString().slice(-1500));
      if (err.stdout) console.error(err.stdout.toString().slice(-1500));
    }
  } else if (seedDemo && target === "cloudflare") {
    p.note(
      [
        "Seeding for Cloudflare requires a D1 database.",
        "",
        `  ${pm.dlx} wrangler d1 create ${projectName}-db`,
        "  # Add the database_id to wrangler.toml",
        `  ${pm.dlx} wrangler d1 migrations apply ${projectName}-db --local`,
        `  ${pm.run} cms:seed`,
      ].join("\n"),
      "Seed manually",
    );
  }

  // --- Cloudflare resource setup ---

  const cf = { d1Created: false, r2Created: false, migrationsApplied: false, deployed: false, url: null };
  if (target === "cloudflare") {
    const setupNow = await p.confirm({
      message: "Set up Cloudflare resources now? (creates D1 database and R2 bucket)",
      initialValue: true,
    });

    if (!p.isCancel(setupNow) && setupNow) {
      // Check wrangler authentication
      let authenticated = false;
      try {
        execSync(`${pm.exec} wrangler whoami`, { cwd: projectDir, stdio: "pipe" });
        authenticated = true;
      } catch {
        p.note("You need to log in to Cloudflare first.", "Wrangler login required");
        const doLogin = await p.confirm({ message: "Open browser to log in?", initialValue: true });
        if (!p.isCancel(doLogin) && doLogin) {
          try {
            execSync(`${pm.exec} wrangler login`, { cwd: projectDir, stdio: "inherit" });
            authenticated = true;
          } catch {
            s.stop("Login failed");
          }
        }
      }

      if (authenticated) {
        // Create D1 database
        let databaseId = null;
        s.start("Creating D1 database");
        try {
          const output = execSync(`${pm.exec} wrangler d1 create ${projectName}-db`, {
            cwd: projectDir,
            stdio: "pipe",
          }).toString();
          // Parse database_id from output (looks for UUID-like string)
          const match = output.match(/database_id\s*=\s*"([^"]+)"/);
          if (match) databaseId = match[1];
          cf.d1Created = true;
          s.stop("D1 database created");
        } catch (err) {
          // Already exists — look it up
          try {
            const listOutput = execSync(`${pm.exec} wrangler d1 list`, { cwd: projectDir, stdio: "pipe" }).toString();
            const lines = listOutput.split("\n");
            const dbLine = lines.find((l) => l.includes(`${projectName}-db`));
            if (dbLine) {
              const idMatch = dbLine.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
              if (idMatch) databaseId = idMatch[0];
            }
            if (databaseId) {
              cf.d1Created = true;
              s.stop("D1 database already exists — using existing");
            } else {
              s.stop("D1 setup failed");
              if (err.stderr) console.error(err.stderr.toString());
            }
          } catch {
            s.stop("D1 setup failed");
          }
        }

        // Update wrangler.toml with database_id
        if (databaseId) {
          const wranglerPath = path.join(projectDir, "wrangler.toml");
          let wranglerContent = readFileSync(wranglerPath, "utf-8");
          wranglerContent = wranglerContent.replace(
            /database_id = "" #[^\n]*/,
            `database_id = "${databaseId}"`,
          );
          writeFileSync(wranglerPath, wranglerContent);
        }

        // Create R2 bucket
        s.start("Creating R2 bucket");
        try {
          execSync(`${pm.exec} wrangler r2 bucket create ${projectName}-assets`, { cwd: projectDir, stdio: "pipe" });
          cf.r2Created = true;
          s.stop("R2 bucket created");
        } catch {
          // Already exists is fine — assume it's there
          cf.r2Created = true;
          s.stop("R2 bucket already exists");
        }

        // Generate migrations and apply to remote D1
        if (databaseId) {
          s.start("Generating database migrations");
          try {
            execSync(`${pm.exec} drizzle-kit generate`, { cwd: projectDir, stdio: "pipe" });
            s.stop("Migrations generated");
          } catch (err) {
            s.stop("Migration generation failed");
            if (err.stderr) console.error(err.stderr.toString().slice(-800));
            if (err.stdout) console.error(err.stdout.toString().slice(-800));
          }

          s.start("Applying migrations to remote D1");
          try {
            execSync(`${pm.exec} wrangler d1 migrations apply ${projectName}-db --remote`, {
              cwd: projectDir,
              stdio: "pipe",
              input: "y\n",
            });
            cf.migrationsApplied = true;
            s.stop("Migrations applied");
          } catch {
            s.stop("Migration apply failed — run manually with: wrangler d1 migrations apply --remote");
          }
        }

        // Deploy to Cloudflare
        if (cf.migrationsApplied) {
          const doDeploy = await p.confirm({
            message: "Deploy to Cloudflare now?",
            initialValue: true,
          });
          if (!p.isCancel(doDeploy) && doDeploy) {
            s.start("Building and deploying to Cloudflare");
            try {
              const deployOutput = await runAsync(`${pm.run} run deploy`, projectDir);
              const urlMatch = deployOutput.match(/https:\/\/[^\s]+\.workers\.dev/);
              if (urlMatch) cf.url = urlMatch[0];
              cf.deployed = true;
              s.stop("Deployed to Cloudflare");
            } catch (err) {
              s.stop("Deploy failed — run manually with: pnpm run deploy");
              if (err.stderr) console.error(err.stderr.slice(-1500));
              if (err.stdout) console.error(err.stdout.slice(-1500));
            }
          }
        }
      }
    }
  }

  // --- Done ---

  if (target === "local") {
    p.outro("Starting dev server...");
    try {
      execSync(`${pm.run} dev`, { cwd: projectDir, stdio: "inherit" });
    } catch {
      console.log(`\n  Project directory: ${projectDir}`);
      console.log(`  To start again:   cd ${projectName} && pnpm dev\n`);
    }
  } else {
    if (cf.deployed && cf.url) {
      p.note([`Live at: ${cf.url}`, `Admin:   ${cf.url}/admin`, "", `cd ${projectName}`, "", "Local development:", `  ${pm.run} dev`, "", "Redeploy:", "  pnpm run deploy"].join("\n"), "🎉 Your Kide CMS is live");
      p.outro("Project created!");
    } else {
      const lines = [`cd ${projectName}`];
      const remaining = [];
      if (!cf.d1Created) {
        remaining.push(
          `  ${pm.dlx} wrangler d1 create ${projectName}-db`,
          "  # Copy the database_id to wrangler.toml",
        );
      }
      if (!cf.r2Created) {
        remaining.push(`  ${pm.dlx} wrangler r2 bucket create ${projectName}-assets`);
      }
      if (!cf.migrationsApplied) {
        remaining.push(`  ${pm.dlx} wrangler d1 migrations apply ${projectName}-db --remote`);
      }
      if (!cf.deployed) {
        remaining.push(`  ${pm.run} run deploy`);
      }
      if (remaining.length > 0) {
        lines.push("", "Remaining setup:", ...remaining);
      }
      lines.push("", "Local development:", `  ${pm.run} dev`);
      p.note(lines.join("\n"), "Next steps");
      p.outro("Project created!");
    }
  }
}

main().catch((err) => {
  p.cancel(err.message);
  process.exit(1);
});
