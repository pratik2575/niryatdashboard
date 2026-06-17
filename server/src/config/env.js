import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 4000),
  mongodbUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  nodeEnv: process.env.NODE_ENV || 'development',
  adminEmail: process.env.ADMIN_EMAIL || '',
  adminPassword: process.env.ADMIN_PASSWORD || ''
};

export function assertRuntimeEnv() {
  if (!env.mongodbUri) {
    throw new Error('MONGODB_URI is required');
  }

  if (env.nodeEnv === 'production' && env.jwtSecret === 'dev-only-change-me') {
    throw new Error('JWT_SECRET must be configured in production');
  }
}
