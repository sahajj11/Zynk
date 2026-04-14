import { z } from '@hono/zod-openapi';

export const TaskSchema = z.object({
  id: z.number().openapi({ example: 1 }),
  title: z.string().min(3).openapi({ example: 'Fix login bug' }),
  status: z.enum(['TODO', 'DONE']).openapi({ example: 'TODO' }),
}).openapi('Task'); // Name it for the OpenAPI registry