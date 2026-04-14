import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "mysql", // Change this from 'postgresql'
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});