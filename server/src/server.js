import { buildApp } from './app.js';
import { connectDb } from './config/db.js';
import { assertRuntimeEnv, env } from './config/env.js';

async function main() {
  assertRuntimeEnv();
  await connectDb();

  const app = await buildApp();
  await app.listen({ port: env.port, host: '0.0.0.0' });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
