import { buildApp } from './app';
import { loadConfig } from './config';
import type { ServerConfig } from './config';

function readConfig(): ServerConfig {
  try {
    return loadConfig();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const config = readConfig();
  const app = await buildApp({
    dataDir: config.dataDir,
    adminPassword: config.adminPassword,
    adminUsername: config.adminUsername,
    sessionTtlMs: config.sessionTtlMs,
    logger: true,
  });

  await app.listen({ host: config.host, port: config.port });
  app.log.info(`FFM 服务已启动：http://${config.host}:${config.port}`);

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info(`收到 ${signal} 信号，正在关闭服务…`);
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      console.error('关闭服务失败', error);
      process.exit(1);
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

void main().catch((error: unknown) => {
  console.error('服务启动失败', error);
  process.exit(1);
});
