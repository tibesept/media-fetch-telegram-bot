import fs from 'node:fs';
import { config } from './config.js';
import { logger } from './logger.js';
import { createBot } from './bot.js';

async function main(): Promise<void> {
  // Ensure directories exist
  for (const dir of [config.tempDir, config.cookiesDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Create the bot
  const bot = createBot();

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');

    try {
      await bot.stop();
    } catch {
      // ignore
    }

    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start long polling
  logger.info('Starting bot with long polling...');
  await bot.start({
    onStart: (info) => {
      logger.info({ username: info.username }, 'Bot is running');
    },
  });
}

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught Exception');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason }, 'Unhandled Rejection');
});

main().catch((err) => {
  logger.fatal({ err }, 'Fatal error in main');
  process.exit(1);
});
