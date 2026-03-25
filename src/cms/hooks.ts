import type { HooksConfig } from "./core/define";
import config from "./cms.config";

const hooks: HooksConfig = {};
for (const collection of config.collections) {
  if (collection.hooks) {
    hooks[collection.slug] = collection.hooks;
  }
}

export default hooks;
