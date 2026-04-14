import type { OpenAPIHono } from "@hono/zod-openapi";
import { authRouter } from "./modules/auth/auth.routes.js";

export const router = (app: OpenAPIHono) => {

    app.route('/api/v1/user',authRouter)
}