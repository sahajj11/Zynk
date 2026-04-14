import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema.js";
import { services } from "./services.js";

let db: MySql2Database<typeof schema>;

export async function getDatabaseConnection() {
    if (db) {
        return services({
            db: db
        });
    }

    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL environment variable is not set.");
    }

    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    db = drizzle(connection, { schema, mode: "default" });

    return services({
        db: db
    });
};
