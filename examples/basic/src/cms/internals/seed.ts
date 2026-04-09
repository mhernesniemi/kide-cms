import { seedDatabase } from "@kidecms/core";

import "./runtime";
import config from "../cms.config";
import seedData from "./seed.data";

await seedDatabase(config, seedData);
