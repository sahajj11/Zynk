import { z } from '@hono/zod-openapi';

// User Schema for documentation
export const UserSchema = z.object({
  id: z.number().openapi({ example: 1 }),
  name: z.string().openapi({ example: 'Sahaj Rajput' }),
  email: z.string().email().openapi({ example: 'sahaj@example.com' }),
}).openapi('User');

// Register Request Schema
export const RegisterRequestSchema = z.object({
  name: z.string().min(2).openapi({ example: 'Sahaj Rajput' }),
  email: z.string().email().openapi({ example: 'sahaj@example.com' }),
  password: z.string().min(6).openapi({ example: 'strongpassword123' }),
}).openapi('RegisterRequest');

export type RegisterRequestSchemaType = z.infer<typeof RegisterRequestSchema>;

// Login Request Schema
export const LoginRequestSchema = z.object({
  email: z.string().email().openapi({ example: 'sahaj@example.com' }),
  password: z.string().openapi({ example: 'strongpassword123' }),
}).openapi('LoginRequest');

// Auth Response (JWT)
export const AuthResponseSchema = z.object({
  token: z.string().openapi({ example: 'eyJhbGciOiJIUzI1...' }),
  user: UserSchema,
}).openapi('AuthResponse');