import { createRoute , z } from '@hono/zod-openapi';
import { TaskSchema } from '../../../drizzle/schemas/task.schema.js';

export const getTaskRoute = createRoute({
  method: 'get',
  path: '/{id}',
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: TaskSchema } },
      description: 'Retrieve a Jira task',
    },
  },
});