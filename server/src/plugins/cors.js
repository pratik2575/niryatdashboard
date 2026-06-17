import fp from 'fastify-plugin';
import cors from '@fastify/cors';

export default fp(async function corsPlugin(app) {
  await app.register(cors, {
    origin: true,
    credentials: true
  });
});
