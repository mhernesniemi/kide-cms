// auto-generated -- do not edit
import config from "../collections.config";

export const validators = Object.fromEntries(
  config.collections.map((collection) => [
    collection.slug,
    {
      fields: collection.fields,
      requiredFields: Object.entries(collection.fields)
        .filter(([, field]) => field.required)
        .map(([fieldName]) => fieldName),
      translatableFields: Object.entries(collection.fields)
        .filter(([, field]) => field.translatable)
        .map(([fieldName]) => fieldName),
    },
  ]),
);
