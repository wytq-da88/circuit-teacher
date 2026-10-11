import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createApp, PROJECT_ROOT } from './app';

const app = await createApp();
const dist = path.join(PROJECT_ROOT, 'dist');
const development = process.env.NODE_ENV !== 'production' && !process.argv.includes('--production');
if (!development && !existsSync(path.join(dist, 'index.html'))) throw new Error('请先运行 npm run build，再启动生产版本。');
let closeVite: (() => Promise<void>) | undefined;
if (development) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: PROJECT_ROOT, server: { middlewareMode: true, host: '127.0.0.1' }, appType: 'spa' });
  app.use(vite.middlewares);
  closeVite = () => vite.close();
} else {
  app.use(express.static(dist));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
const server = app.listen(4317, '127.0.0.1', () => console.log('电路课件工坊已启动：http://127.0.0.1:4317'));
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE' ? '端口 4317 已占用，请打开现有服务或关闭后重试。' : '本机服务启动失败，请检查运行环境。');
  process.exitCode = 1;
  void closeVite?.();
});
function shutdown() { server.close(() => { void closeVite?.().finally(() => process.exit()); }); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
