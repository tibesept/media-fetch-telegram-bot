import puppeteer from 'puppeteer';
import type { BaseScraper } from './scrapers/base.js';
import { writeCookieFile } from './cookie-writer.js';
import { config } from './config.js';

const intervals: ReturnType<typeof setInterval>[] = [];

export function startScheduler(scrapers: BaseScraper[]): void {
  for (const scraper of scrapers) {
    console.log(
      `[scheduler] Registering scraper: ${scraper.platform} (every ${scraper.intervalMs / 60000} min)`,
    );

    // Run immediately on startup
    runScraper(scraper);

    // Then schedule periodic runs
    const interval = setInterval(() => runScraper(scraper), scraper.intervalMs);
    intervals.push(interval);
  }
}

export function stopScheduler(): void {
  for (const interval of intervals) {
    clearInterval(interval);
  }
  intervals.length = 0;
}

async function runScraper(scraper: BaseScraper): Promise<void> {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${scraper.platform}] Starting cookie harvesting...`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
      executablePath: config.puppeteerExecutablePath,
    });

    const cookies = await scraper.scrape(browser);

    if (!scraper.validateCookies(cookies)) {
      console.error(
        `[${scraper.platform}] Cookie validation failed: missing required cookies (${scraper.requiredCookies.join(', ')})`,
      );
      return;
    }

    const content = scraper.toCookieFileContent(cookies);
    writeCookieFile(scraper.cookieFileName, content);

    console.log(
      `[${new Date().toISOString()}] [${scraper.platform}] Successfully wrote ${cookies.length} cookies to ${scraper.cookieFileName}`,
    );
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] [${scraper.platform}] Scraping failed:`,
      error instanceof Error ? error.message : error,
    );
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }
}
