import fp from 'fastify-plugin';
import multipart from '@fastify/multipart';

export default fp(async function multipartPlugin(app) {
  await app.register(multipart, {
    limits: {
      fileSize: 25 * 1024 * 1024
    }
  });
});
