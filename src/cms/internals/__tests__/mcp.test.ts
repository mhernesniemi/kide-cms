import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * End-to-end test for the MCP server's schema hot-reload: the stdio process
 * must survive a cms.config.ts change and answer the next tool call from a
 * respawned worker, without the client reconnecting.
 */
const repoRoot = process.cwd();
const configPath = path.join(repoRoot, "src/cms/cms.config.ts");

let tmp: string;
let child: ChildProcessWithoutNullStreams;
let stderrLog = "";
let originalMtime: Date;

const pendingResponses = new Map<number, (message: any) => void>();

const send = (message: object) => {
  child.stdin.write(`${JSON.stringify(message)}\n`);
};

const request = (id: number, method: string, params?: object) =>
  new Promise<any>((resolve) => {
    pendingResponses.set(id, resolve);
    send({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });
  });

const listCollectionSlugs = async (id: number) => {
  const response = await request(id, "tools/call", { name: "kide_list_collections", arguments: {} });
  expect(response.result?.isError).not.toBe(true);
  const parsed = JSON.parse(response.result.content[0].text) as Array<{ slug: string }>;
  return parsed.map((collection) => collection.slug);
};

beforeAll(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "kide-mcp-test-"));
  originalMtime = statSync(configPath).mtime;

  child = spawn("node", ["--import", "tsx", path.join(repoRoot, "src/cms/internals/mcp.ts")], {
    cwd: repoRoot,
    env: { ...process.env, CMS_DATABASE_URL: path.join(tmp, "mcp.db") },
    stdio: "pipe",
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderrLog += chunk.toString();
  });

  let buffered = "";
  child.stdout.on("data", (chunk: Buffer) => {
    buffered += chunk.toString();
    let newline: number;
    while ((newline = buffered.indexOf("\n")) !== -1) {
      const line = buffered.slice(0, newline);
      buffered = buffered.slice(newline + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      const resolve = pendingResponses.get(message.id);
      if (resolve) {
        pendingResponses.delete(message.id);
        resolve(message);
      }
    }
  });
});

afterAll(() => {
  child?.kill("SIGTERM");
  utimesSync(configPath, originalMtime, originalMtime);
  rmSync(tmp, { recursive: true, force: true });
});

describe("kide mcp", () => {
  it("serves tool calls and hot-reloads the project modules after a schema change", async () => {
    const init = await request(1, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "vitest", version: "0.0.0" },
    });
    expect(init.result.serverInfo.name).toBe("kide-cms");
    send({ jsonrpc: "2.0", method: "notifications/initialized" });

    const firstSlugs = await listCollectionSlugs(2);
    expect(firstSlugs).toContain("pages");
    expect(stderrLog).not.toContain("reloading project modules");

    // A bumped mtime (content unchanged) is indistinguishable from a schema
    // edit to the snapshot check, and safe to do against the real repo.
    const future = new Date(Date.now() + 5000);
    utimesSync(configPath, future, future);

    const secondSlugs = await listCollectionSlugs(3);
    expect(secondSlugs).toEqual(firstSlugs);
    expect(stderrLog).toContain("reloading project modules");
  }, 120_000);
});
