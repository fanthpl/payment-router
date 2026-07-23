import { defineConfig } from "drizzle-kit";

// Migrations are generated here and applied with `wrangler d1 migrations apply`, which is why no
// D1 credentials are needed: drizzle-kit only has to emit SQL.
export default defineConfig({
    dialect: "sqlite",
    schema: "./src/db/schema.ts",
    out: "./migrations",
});
