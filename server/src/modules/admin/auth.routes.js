import { AdminUser } from '../../models/index.js';
import { env } from '../../config/env.js';

export default async function authRoutes(app) {
  app.post('/login', async (request, reply) => {
    const { email, password } = request.body || {};

    if (!env.adminEmail || !env.adminPassword) {
      return reply.status(503).send({
        success: false,
        error: 'ADMIN_EMAIL and ADMIN_PASSWORD are not configured'
      });
    }

    if (email !== env.adminEmail || password !== env.adminPassword) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid credentials'
      });
    }

    const user = await AdminUser.findOneAndUpdate(
      { email },
      { $set: { email, role: 'admin', name: 'Admin' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const token = app.jwt.sign({
      sub: String(user._id),
      email: user.email,
      role: user.role
    });

    return {
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name
      }
    };
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (request) => ({
    success: true,
    user: request.user
  }));
}
