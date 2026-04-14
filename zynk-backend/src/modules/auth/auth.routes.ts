import { createRoute } from '@hono/zod-openapi';
import { AuthResponseSchema, LoginRequestSchema, RegisterRequestSchema } from '../../../drizzle/schemas/auth.schema.js';

export const registerRoute = createRoute({
  method: 'post',
  path: '/register',
  request: {
    body: {
      content: { 'application/json': { schema: RegisterRequestSchema } },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: AuthResponseSchema } },
      description: 'User registered successfully',
    },
    400: { description: 'User already exists or invalid data' },
  },
});

export const loginRoute = createRoute({
  method: 'post',
  path: '/login',
  request: {
    body: {
      content: { 'application/json': { schema: LoginRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: AuthResponseSchema } },
      description: 'Login successful',
    },
    401: { description: 'Invalid credentials' },
  },
});