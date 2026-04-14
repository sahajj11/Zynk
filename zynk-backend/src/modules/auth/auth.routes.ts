import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  AuthResponseSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
} from "../../../drizzle/schemas/auth.schema.js";
import { registerHandler } from "./auth.handlers.js";
import { AppError } from "../../config/AppError.js";
 
export const authRouter = new OpenAPIHono();

authRouter.openapi(
  {
    method: "post",
    path: "/register",
    request: {
      body: {
        content: { "application/json": { schema: RegisterRequestSchema } },
      },
    },
    responses: {
       201: {
        content: { "application/json": { schema: AuthResponseSchema } },
        description: "User registered successfully",
      },
      400: {
        description: "User already exists or invalid data",
        content: {
          "application/json": {
            schema: z.object({
              message: z.string(),
            }),
          },
        },
      },
      500: {
        description: "Internal Server Error",
        content: {
          "application/json": {
            schema: z.object({
              message: z.string(),
            }),
          },
        },
      },
    },
  },
  async (c) => {
    let body = c.req.valid("json");

    try {
      let res = await registerHandler(body);

      return c.json(res, 201);
    } catch (error) {
      if (error instanceof AppError) {
        return c.json(
          {
            message: error.message,
          },
          error.statusCode as 400,
        );
      }
      return c.json({
        message: 'Internal Server Error'
      },500)
    }
  },
);

export const loginRoute = createRoute({
  method: "post",
  path: "/login",
  request: {
    body: {
      content: { "application/json": { schema: LoginRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: AuthResponseSchema } },
      description: "Login successful",
    },
    401: { description: "Invalid credentials" },
  },
});