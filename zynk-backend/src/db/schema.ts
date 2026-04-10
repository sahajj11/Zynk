import { mysqlTable, serial, varchar, text, timestamp, mysqlEnum } from "drizzle-orm/mysql-core";

// Define Task Statuses
export const statusEnum = mysqlEnum("status", ["BACKLOG", "TODO", "IN_PROGRESS", "DONE"]);

export const tasks = mysqlTable("tasks", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").onUpdateNow(), // Auto-updates on MySQL
});