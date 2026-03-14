import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { CMSConfig, CollectionConfig, FieldConfig } from "./define";
import { getTranslatableFieldNames } from "./define";
import { getDb } from "./db";
import { hashPassword } from "./auth";
import { cloneValue, slugify } from "./values";
import seedData from "../seed.data";

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
    if (field && isJsonField(field) && value !== undefined && value !== null) {
      result[key] = JSON.stringify(value);
    } else {
      result[key] = value;
    }
  }
  return result;
};

export const seedDatabase = async (config: CMSConfig) => {
  const db = await getDb();
  const schema = await import("../.generated/schema");
  for (const collection of config.collections) {
    const collectionSeed = seedData[collection.slug];
    if (!collectionSeed || collectionSeed.length === 0) continue;

    const tables = schema.cmsTables[collection.slug as keyof typeof schema.cmsTables] as {
      main: any;
      translations?: any;
      versions?: any;
    };
    if (!tables) continue;

    // Idempotent: only seed if table has zero rows
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(tables.main);
    const rowCount = Number(countResult[0]?.count ?? 0);
    if (rowCount > 0) continue;

    console.log(`  Seeding ${collection.labels.plural}...`);

    for (const seedDoc of collectionSeed) {
      const now = new Date().toISOString();
      const docId = typeof seedDoc._id === "string" ? String(seedDoc._id) : nanoid();

      // Separate translations from the seed data
      const translations = seedDoc._translations as
        | Array<{ locale: string; values: Record<string, unknown> }>
        | undefined;
      const { _id, _translations, _status, ...fieldData } = seedDoc as Record<string, unknown>;

      // Auto-generate slugs
      for (const [fieldName, field] of Object.entries(collection.fields)) {
        if (field.type !== "slug") continue;
        if (fieldData[fieldName]) {
          fieldData[fieldName] = slugify(String(fieldData[fieldName]));
        } else if (field.from && fieldData[field.from]) {
          fieldData[fieldName] = slugify(String(fieldData[field.from]));
        }
      }

      // Apply defaults for missing fields
      for (const [fieldName, field] of Object.entries(collection.fields)) {
        if (fieldData[fieldName] === undefined && field.defaultValue !== undefined) {
          fieldData[fieldName] = cloneValue(field.defaultValue);
        }
      }

      // Hash passwords for auth collections
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
        if (status === "published") docValues._publishedAt = now;
      }
      if (collection.timestamps !== false) {
        docValues._createdAt = now;
        docValues._updatedAt = now;
      }

      await db.insert(tables.main).values(docValues);

      // Insert translations
      if (translations && tables.translations) {
        const translatableFields = getTranslatableFieldNames(collection);

        for (const { locale, values } of translations) {
          const translationData: Record<string, unknown> = {};
          for (const fn of translatableFields) {
            if (values[fn] !== undefined) {
              const field = collection.fields[fn];
              translationData[fn] = field && isJsonField(field) ? JSON.stringify(values[fn]) : values[fn];
            }
          }

          await db.insert(tables.translations).values({
            _id: nanoid(),
            _entityId: docId,
            _languageCode: locale,
            ...translationData,
          });
        }
      }

      // Create initial version
      if (collection.versions && tables.versions) {
        await db.insert(tables.versions).values({
          _id: nanoid(),
          _docId: docId,
          _version: 1,
          _snapshot: JSON.stringify({ ...fieldData, _status: docValues._status }),
          _createdAt: now,
        });
      }
    }
  }
};
