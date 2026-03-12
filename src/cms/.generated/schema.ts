// auto-generated -- do not edit
import config from "../collections.config";

export const generatedSchema = [
  {
    "slug": "authors",
    "labels": {
      "singular": "Author",
      "plural": "Authors"
    },
    "pathPrefix": null,
    "drafts": false,
    "versions": 0,
    "fields": {
      "name": {
        "type": "text",
        "required": true,
        "translatable": false
      },
      "slug": {
        "type": "slug",
        "required": false,
        "translatable": false
      },
      "role": {
        "type": "text",
        "required": true,
        "translatable": false
      },
      "bio": {
        "type": "richText",
        "required": false,
        "translatable": true
      },
      "avatar": {
        "type": "image",
        "required": false,
        "translatable": false
      }
    }
  },
  {
    "slug": "posts",
    "labels": {
      "singular": "Post",
      "plural": "Posts"
    },
    "pathPrefix": "blog",
    "drafts": true,
    "versions": 20,
    "fields": {
      "title": {
        "type": "text",
        "required": true,
        "translatable": true
      },
      "slug": {
        "type": "slug",
        "required": false,
        "translatable": true
      },
      "excerpt": {
        "type": "text",
        "required": false,
        "translatable": true
      },
      "body": {
        "type": "richText",
        "required": false,
        "translatable": true
      },
      "cover": {
        "type": "image",
        "required": false,
        "translatable": false
      },
      "category": {
        "type": "select",
        "required": false,
        "translatable": false
      },
      "author": {
        "type": "relation",
        "required": false,
        "translatable": false
      },
      "tags": {
        "type": "array",
        "required": false,
        "translatable": false
      },
      "metadata": {
        "type": "json",
        "required": false,
        "translatable": false
      },
      "sortOrder": {
        "type": "number",
        "required": false,
        "translatable": false
      }
    }
  },
  {
    "slug": "pages",
    "labels": {
      "singular": "Page",
      "plural": "Pages"
    },
    "pathPrefix": null,
    "drafts": true,
    "versions": 20,
    "fields": {
      "title": {
        "type": "text",
        "required": true,
        "translatable": true
      },
      "slug": {
        "type": "slug",
        "required": false,
        "translatable": true
      },
      "summary": {
        "type": "text",
        "required": false,
        "translatable": true
      },
      "layout": {
        "type": "select",
        "required": false,
        "translatable": false
      },
      "heroImage": {
        "type": "image",
        "required": false,
        "translatable": false
      },
      "blocks": {
        "type": "blocks",
        "required": false,
        "translatable": true
      }
    }
  }
];

export const collectionMap = Object.fromEntries(config.collections.map((collection) => [collection.slug, collection]));
