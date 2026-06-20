import Fastify from 'fastify';
import corsPlugin from './plugins/cors.js';
import multipartPlugin from './plugins/multipart.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './modules/admin/auth.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import productRoutes from './modules/products/product.routes.js';
import countryRoutes from './modules/countries/country.routes.js';
import searchRoutes from './modules/search/search.routes.js';
import indiaExportRoutes from './modules/india-exports/india-export.routes.js';

export async function buildApp() {
  const app = Fastify({
    logger: true,
    bodyLimit: 25 * 1024 * 1024
  });

  await app.register(corsPlugin);
  await app.register(multipartPlugin);
  await app.register(authPlugin);

  app.get('/health', async () => ({
    status: 'ok',
    service: 'niryat-portal-api',
    timestamp: new Date().toISOString()
  }));

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(productRoutes, { prefix: '/api/products' });
  await app.register(countryRoutes, { prefix: '/api/countries' });
  await app.register(searchRoutes, { prefix: '/api/search' });
  await app.register(indiaExportRoutes, { prefix: '/api/india-exports' });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      success: false,
      error: statusCode === 500 ? 'Internal Server Error' : error.message
    });
  });

  return app;
}
