import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://founderhq:founderhq@localhost:5432/founderhq",
  },
  strict: true,
  verbose: true,
});
