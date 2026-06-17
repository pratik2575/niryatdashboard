import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { env } from '../config/env.js';

export default fp(async function authPlugin(app) {
  await app.register(jwt, {
    secret: env.jwtSecret
  });

  app.decorate('authenticate', async function authenticate(request) {
    await request.jwtVerify();
  });
});
