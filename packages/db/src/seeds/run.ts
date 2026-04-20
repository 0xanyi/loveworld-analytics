import { createDb } from "../client";
import { seedSources } from "./sources";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL required");

const db = createDb(url);
await seedSources(db);
console.log("✓ Seeded sources");
