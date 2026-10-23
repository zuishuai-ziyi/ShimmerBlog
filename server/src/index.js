import { createApp } from './app.js';
import { initDatabase } from './db.js';
import { config } from './config.js';
import fs from 'node:fs';

for (const evt of ['uncaughtException', 'unhandledRejection']) {
  process.on(evt, (e) => {
    const line = `[${new Date().toISOString()}] ${evt}: ${e?.stack ?? e}\n`;
    fs.appendFileSync('crash.log', line);
    console.error(line);
  });
}

async function main() {
  await initDatabase();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`[server] 微光博客后端已启动: http://localhost:${config.port}`);
  });
}

main().catch((e) => {
  console.error('[server] 启动失败:', e);
  process.exit(1);
});
