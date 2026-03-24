import type { AccessConfig } from "./core/define";
import config from "./cms.config";

const access: AccessConfig = {};
for (const collection of config.collections) {
  if (collection.access) {
    access[collection.slug] = collection.access;
  }
}

export default access;
