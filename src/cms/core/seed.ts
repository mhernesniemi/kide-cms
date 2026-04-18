import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { hashPassword } from "./auth";
import type { CMSConfig, CollectionConfig, FieldConfig, SeedDocument } from "./define";
import { getDb } from "./runtime";
import { getSchema } from "./schema";
import { cloneValue, slugify } from "./values";

const isJsonField = (field: FieldConfig) =>
  field.type === "richText" ||
  field.type === "array" ||
  field.type === "json" ||
  field.type === "blocks" ||
  (field.type === "relation" && field.hasMany);

const serializeForDb = (collection: CollectionConfig, data: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const field = collection.fields[key];
    result[key] = field && isJsonField(field) && value !== undefined && value !== null ? JSON.stringify(value) : value;
  }
  return result;
};

export const seedDatabase = async (config: CMSConfig, seedData: Record<string, SeedDocument[]>) => {
  const db = await getDb();
  const schema = getSchema();

  for (const collection of config.collections) {
    const collectionSeed = seedData[collection.slug];
    if (!collectionSeed || collectionSeed.length === 0) continue;

    const tables = schema.cmsTables[collection.slug] as {
      main: any;
      translations?: any;
      versions?: any;
    };
    if (!tables) continue;

    const countResult = await db.select({ count: sql<number>`count(*)` }).from(tables.main);
    const rowCount = Number(countResult[0]?.count ?? 0);
    if (rowCount > 0) continue;

    console.log(`  Seeding ${collection.labels.plural}...`);

    for (const seedDoc of collectionSeed) {
      const timestamp = new Date().toISOString();
      const docId = typeof seedDoc._id === "string" ? String(seedDoc._id) : nanoid();
      const { _id, _status, ...fieldData } = seedDoc as Record<string, unknown>;

      for (const [fieldName, field] of Object.entries(collection.fields)) {
        if (field.type !== "slug") continue;
        if (fieldData[fieldName]) {
          fieldData[fieldName] = slugify(String(fieldData[fieldName]));
        } else if (field.from && fieldData[field.from]) {
          fieldData[fieldName] = slugify(String(fieldData[field.from]));
        }
      }

      for (const [fieldName, field] of Object.entries(collection.fields)) {
        if (fieldData[fieldName] === undefined && field.defaultValue !== undefined) {
          fieldData[fieldName] = cloneValue(field.defaultValue);
        }
      }

      if (collection.auth && typeof fieldData.password === "string") {
        fieldData.password = await hashPassword(fieldData.password);
      }

      const serialized = serializeForDb(collection, fieldData);
      const docValues: Record<string, unknown> = {
        _id: docId,
        ...serialized,
      };

      if (collection.drafts) {
        const status = _status === "published" ? "published" : "draft";
        docValues._status = status;
        if (status === "published") docValues._publishedAt = timestamp;
      }
      if (collection.timestamps !== false) {
        docValues._createdAt = timestamp;
        docValues._updatedAt = timestamp;
      }

      await db.insert(tables.main).values(docValues);

      if (collection.versions && tables.versions) {
        await db.insert(tables.versions).values({
          _id: nanoid(),
          _docId: docId,
          _version: 1,
          _snapshot: JSON.stringify({ ...fieldData, _status: docValues._status }),
          _createdAt: timestamp,
        });
      }
    }
  }
};
