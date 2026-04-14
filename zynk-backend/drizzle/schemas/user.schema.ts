import { mysqlTable, serial, varchar, text, timestamp, mysqlEnum, char } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: char("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: text("password").notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;