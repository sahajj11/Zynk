import type { MySql2Database } from "drizzle-orm/mysql2";
import type { users } from "./schema.js";

export interface Ctx {
    db: MySql2Database<{
        [users._.name]: typeof users
    }>;
}