import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const server = await createServer({
  server: {
    host: '127.0.0.1',
    port: 5173
  }
});

await server.listen();
server.printUrls();

const devUrl = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5173/';
const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: devUrl
  }
});

const shutdown = async () => {
  child.kill();
  await server.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
