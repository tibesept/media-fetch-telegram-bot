import { config } from './config.js';
import { InstagramScraper } from './scrapers/instagram.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import type { BaseScraper } from './scrapers/base.js';

function main(): void {
  console.log('Cookie Getter microservice starting...');

  // Register scrapers — add new ones here
  const scrapers: BaseScraper[] = [];

  if (config.instagramLogin && config.instagramPassword) {
    scrapers.push(new InstagramScraper());
    console.log('Registered: InstagramScraper');
  } else {
    console.warn('INSTAGRAM_LOGIN/INSTAGRAM_PASSWORD not set, skipping Instagram scraper');
  }

  // Add future scrapers here:
  // if (config.tiktokLogin && config.tiktokPassword) {
  //   scrapers.push(new TikTokScraper());
  // }

  if (scrapers.length === 0) {
    console.error('No scrapers configured. Exiting.');
    process.exit(1);
  }

  startScheduler(scrapers);

  // Graceful shutdown
  const shutdown = () => {
    console.log('Shutting down cookie getter...');
    stopScheduler();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`Cookie Getter running. ${scrapers.length} scraper(s) active.`);
}

main();
