import 'dotenv/config';

import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { serve } from '@hono/node-server';
import { loginRoute, registerRoute } from './modules/auth/auth.routes.js';
import { loginHandler, registerHandler } from './modules/auth/auth.handlers.js';

const app = new OpenAPIHono();

app.openapi(registerRoute,registerHandler)
app.openapi(loginRoute,loginHandler)

// Documentation Endpoint
app.doc('/doc', {
  openapi: '3.0.0',
  info: { title: 'Zynk API', version: '1.0.0' },
});

// Interactive UI (Swagger)
app.get('/ui', swaggerUI({ url: '/doc' }));

const port = 3000;
console.log(`🔥 Zynk is running at http://localhost:${port}`);
console.log(`📖 Swagger UI available at http://localhost:${port}/ui`);

serve({
  fetch: app.fetch,
  port,
});

export default app;