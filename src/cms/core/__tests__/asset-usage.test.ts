/**
 * Asset usage + delete-safety on an in-memory SQLite DB with the real generated
 * schema. Image fields store the storagePath string, so "where is this used" is a
 * scan for that string across image columns and every JSON-serialized column.
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { pushSQLiteSchema } from "drizzle-kit/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as generatedSchema from "./fixtures/project/src/cms/.generated/schema";
import config from "./fixtures/config";
import { createCms } from "../api";
import { assets, stripMissingAssetImages } from "../assets";
import { AssetInUseError, countAssetUsage, findAssetUsage } from "../asset-usage";
import { setUsageConfig } from "../asset-usage";
import { configureCmsRuntime, resetCmsRuntime } from "../runtime";
import { initSchema, resetSchema } from "../schema";

let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle>;
let cms: any;

const upload = (name: string) => assets.upload(new File([new Uint8Array([1, 2, 3, 4])], name, { type: "image/png" }));

const usageRefs = async (path: string) => (await findAssetUsage(config, path)).refs;

const totalDocs = (refs: Array<{ docs: unknown[] }>) => refs.reduce((sum, ref) => sum + ref.docs.length, 0);

beforeAll(async () => {
  sqlite = new Database(":memory:");
  db = drizzle(sqlite);

  const { statementsToExecute } = await pushSQLiteSchema({ ...generatedSchema }, db as never);
  for (const statement of statementsToExecute) sqlite.exec(statement);

  initSchema(generatedSchema as never);

  const files = new Map<string, Uint8Array>();
  configureCmsRuntime({
    getDb: async () => db,
    storage: {
      putFile: async (p, data) => {
        files.set(p, data instanceof Uint8Array ? data : new Uint8Array(data));
      },
      getFile: async (p) => {
        const data = files.get(p);
        if (!data) return null;
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      },
      deleteFile: async (p) => {
        files.delete(p);
      },
    },
  });

  // Also registers the config used by the assets.delete() in-use guard.
  cms = createCms(config);
});

afterAll(() => {
  resetCmsRuntime();
  resetSchema();
  sqlite.close();
});

describe("findAssetUsage", () => {
  it("reports nothing for an asset no document references", async () => {
    const asset = await upload("unused.png");
    const result = await findAssetUsage(config, asset.storagePath);
    expect(result.refs).toEqual([]);
    expect(result.incomplete).toEqual([]);
  });

  it("finds an asset stored in a plain image field", async () => {
    const asset = await upload("hero.png");
    const post = await cms.posts.create({ title: "Image field post", image: asset.storagePath });

    const usage = await usageRefs(asset.storagePath);
    expect(usage).toHaveLength(1);
    expect(usage[0].collectionSlug).toBe("posts");
    expect(usage[0].collectionLabel).toBe("Posts");
    expect(usage[0].docs).toEqual([{ _id: post._id, label: "Image field post" }]);
  });

  it("finds an asset inside a content field's inline image node", async () => {
    const asset = await upload("inline.png");
    const post = await cms.posts.create({
      title: "Inline image post",
      body: {
        type: "root",
        children: [{ type: "image", src: asset.storagePath, alt: "Inline" }],
      },
    });

    const usage = await usageRefs(asset.storagePath);
    expect(usage.flatMap((ref) => ref.docs.map((doc) => doc._id))).toEqual([post._id]);
  });

  it("finds an asset nested inside a blocks field", async () => {
    const asset = await upload("blocky.png");
    const page = await cms.pages.create({
      title: "Blocks page",
      blocks: [
        {
          type: "text",
          heading: "With an image",
          content: { type: "root", children: [{ type: "image", src: asset.storagePath, alt: "" }] },
        },
      ],
    });

    const usage = await usageRefs(asset.storagePath);
    expect(usage.flatMap((ref) => ref.docs.map((doc) => doc._id))).toEqual([page._id]);
  });

  it("finds an asset used only in a non-default locale translation", async () => {
    const asset = await upload("translated.png");
    const post = await cms.posts.create({ title: "Translated post" });
    await cms.posts.upsertTranslation(post._id, "fi", {
      title: "Käännetty",
      body: { type: "root", children: [{ type: "image", src: asset.storagePath, alt: "" }] },
    });

    const usage = await usageRefs(asset.storagePath);
    expect(usage.flatMap((ref) => ref.docs.map((doc) => doc._id))).toEqual([post._id]);
  });

  it("still finds an asset that survives only in the published snapshot", async () => {
    const asset = await upload("published-only.png");
    const post = await cms.posts.create({ title: "Snapshot post", image: asset.storagePath });
    await cms.posts.publish(post._id);
    // The draft drops the image; the live site still serves the published snapshot.
    await cms.posts.update(post._id, { image: "" });

    const usage = await usageRefs(asset.storagePath);
    expect(usage.flatMap((ref) => ref.docs.map((doc) => doc._id))).toEqual([post._id]);
  });

  it("reports each referencing document once, not once per matching column", async () => {
    const asset = await upload("twice.png");
    const post = await cms.posts.create({
      title: "Used twice",
      image: asset.storagePath,
      body: { type: "root", children: [{ type: "image", src: asset.storagePath, alt: "" }] },
    });

    const usage = await usageRefs(asset.storagePath);
    expect(totalDocs(usage)).toBe(1);
    expect(usage[0].docs[0]._id).toBe(post._id);
  });
});

describe("countAssetUsage", () => {
  it("counts many assets in one pass and reports zero for unused ones", async () => {
    const used = await upload("counted-used.png");
    const unused = await upload("counted-unused.png");
    await cms.pages.create({ title: "Counted page A", image: used.storagePath });
    await cms.pages.create({ title: "Counted page B", image: used.storagePath });

    const { counts } = await countAssetUsage(config, [used.storagePath, unused.storagePath]);
    expect(counts[used.storagePath]).toBe(2);
    expect(counts[unused.storagePath]).toBe(0);
  });

  it("returns an empty result for no input", async () => {
    expect(await countAssetUsage(config, [])).toEqual({ counts: {}, incomplete: [] });
  });
});

describe("assets.delete", () => {
  it("deletes an unused asset", async () => {
    const asset = await upload("disposable.png");
    await assets.delete(asset._id);
    expect(await assets.findById(asset._id)).toBeNull();
  });

  it("refuses to delete an asset that is still referenced", async () => {
    const asset = await upload("guarded.png");
    await cms.pages.create({ title: "Guarding page", image: asset.storagePath });

    await expect(assets.delete(asset._id)).rejects.toBeInstanceOf(AssetInUseError);
    // Neither the row nor the file may be gone after a refused delete.
    expect(await assets.findById(asset._id)).not.toBeNull();
  });

  it("carries the usage list on the error so the admin can show it", async () => {
    const asset = await upload("guarded-detail.png");
    await cms.pages.create({ title: "Detail page", image: asset.storagePath });

    const error = await assets.delete(asset._id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AssetInUseError);
    expect((error as AssetInUseError).usage[0].docs[0].label).toBe("Detail page");
  });

  it("refuses to delete rather than skip the check when no config is available", async () => {
    // Reproduces a real miss: the delete route reaches assets.delete() without the
    // generated API ever being imported, so the config createCms() registers is
    // absent. Skipping the check there silently deleted a referenced asset.
    const asset = await upload("no-config.png");
    await cms.pages.create({ title: "Config-less guard page", image: asset.storagePath });

    setUsageConfig(undefined as never);
    try {
      await expect(assets.delete(asset._id)).rejects.toThrow(/cannot check whether this asset is in use/);
      expect(await assets.findById(asset._id)).not.toBeNull();
    } finally {
      setUsageConfig(config);
    }
  });

  it("still deletes without a config when force is set", async () => {
    const asset = await upload("no-config-forced.png");
    setUsageConfig(undefined as never);
    try {
      await assets.delete(asset._id, { force: true });
      expect(await assets.findById(asset._id)).toBeNull();
    } finally {
      setUsageConfig(config);
    }
  });

  it("uses a config passed in the context instead of the registered one", async () => {
    const asset = await upload("explicit-config.png");
    await cms.pages.create({ title: "Explicit config page", image: asset.storagePath });

    setUsageConfig(undefined as never);
    try {
      await expect(assets.delete(asset._id, { config })).rejects.toBeInstanceOf(AssetInUseError);
    } finally {
      setUsageConfig(config);
    }
  });

  it("refuses to delete when a collection could not be searched", async () => {
    const asset = await upload("unverifiable.png");
    // Simulate schema drift: the table backing one collection is gone, so its
    // documents cannot be searched and "unused" is not a safe conclusion.
    sqlite.exec("ALTER TABLE cms_pages RENAME TO cms_pages_hidden");
    try {
      const error = await assets.delete(asset._id).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AssetInUseError);
      expect((error as AssetInUseError).incomplete).toContain("pages");
      expect(await assets.findById(asset._id)).not.toBeNull();
    } finally {
      sqlite.exec("ALTER TABLE cms_pages_hidden RENAME TO cms_pages");
    }
  });

  it("reports an unsearchable collection instead of claiming the asset is unused", async () => {
    const asset = await upload("unverifiable-usage.png");
    sqlite.exec("ALTER TABLE cms_pages RENAME TO cms_pages_hidden");
    try {
      const result = await findAssetUsage(config, asset.storagePath);
      expect(result.refs).toEqual([]);
      expect(result.incomplete).toContain("pages");
    } finally {
      sqlite.exec("ALTER TABLE cms_pages_hidden RENAME TO cms_pages");
    }
  });

  it("deletes a referenced asset when force is set", async () => {
    const asset = await upload("forced.png");
    await cms.pages.create({ title: "Forcing page", image: asset.storagePath });

    await assets.delete(asset._id, { force: true });
    expect(await assets.findById(asset._id)).toBeNull();
  });
});

describe("stripMissingAssetImages", () => {
  it("drops image nodes whose upload no longer exists", async () => {
    const kept = await upload("kept.png");
    const removed = await upload("removed.png");
    await assets.delete(removed._id);

    const document = {
      type: "root",
      children: [
        { type: "paragraph", children: [{ text: "before" }] },
        { type: "image", src: kept.storagePath, alt: "kept" },
        { type: "image", src: removed.storagePath, alt: "gone" },
      ],
    };

    const stripped = await stripMissingAssetImages(document);
    expect(stripped.children).toHaveLength(2);
    expect(stripped.children.map((child: any) => child.type)).toEqual(["paragraph", "image"]);
    expect((stripped.children[1] as any).src).toBe(kept.storagePath);
  });

  it("returns the document untouched when every image resolves", async () => {
    const asset = await upload("intact.png");
    const document = {
      type: "root",
      children: [{ type: "image", src: asset.storagePath, alt: "" }],
    };

    expect(await stripMissingAssetImages(document)).toBe(document);
  });

  it("leaves external images alone", async () => {
    const document = {
      type: "root",
      children: [{ type: "image", src: "https://example.com/remote.png", alt: "" }],
    };

    expect(await stripMissingAssetImages(document)).toBe(document);
  });
});
