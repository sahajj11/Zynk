import { getTableName } from "drizzle-orm";
import type { Ctx } from "./types.js";
import { users, type NewUser, type User } from "./schema.js";
import { BaseService } from "./base.service.js";

export const services = (ctx: Ctx) => ({
    [getTableName(users)] : new BaseService<NewUser, User>(users,ctx)
});
