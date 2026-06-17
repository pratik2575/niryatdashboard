import { connectDb, disconnectDb } from '../config/db.js';
import { assertRuntimeEnv } from '../config/env.js';
import * as models from '../models/index.js';

async function main() {
  assertRuntimeEnv();
  await connectDb();

  for (const model of Object.values(models)) {
    if (model?.syncIndexes) {
      await model.syncIndexes();
      console.log(`Synced indexes for ${model.collection.name}`);
    }
  }

  await disconnectDb();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectDb();
  process.exit(1);
});
