import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.CLIENT_PORT) || 5173;

  // const proxy = {
  //   '/api': 'https://niryatdashboard.onrender.com',
  //   '/health': 'https://niryatdashboard.onrender.com'
  // };
  const proxy = {
    '/api': 'http://localhost:4000',
    '/health': 'http://localhost:4000'
  };

  return {
    plugins: [react()],
    server: { port, proxy },
    preview: { port, proxy }
  };
});
