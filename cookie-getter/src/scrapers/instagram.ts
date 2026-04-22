import type { Browser, Cookie } from 'puppeteer';
import path from 'node:path';
import fs from 'node:fs';
import { BaseScraper } from './base.js';
import { config } from '../config.js';

export class InstagramScraper extends BaseScraper {
  readonly platform = 'instagram';
  readonly cookieFileName = 'instagram.txt';
  readonly intervalMs = config.refreshIntervalMinutes * 60 * 1000;
  readonly requiredCookies = ['sessionid'];

  private readonly username: string;
  private readonly password: string;

  constructor() {
    super();
    this.username = config.instagramLogin;
    this.password = config.instagramPassword;

    if (!this.username || !this.password) {
      throw new Error('INSTAGRAM_LOGIN and INSTAGRAM_PASSWORD must be set');
    }
  }

  async scrape(browser: Browser): Promise<Cookie[]> {
    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    );

    try {
      console.log('[instagram] Navigating to login page...');
      await page.goto('https://www.instagram.com/accounts/login/', {
        waitUntil: 'networkidle2',
      });

      console.log('[instagram] Waiting for input fields...');
      await page.waitForSelector('input', { timeout: 15000 });

      // Human-like random delay between keystrokes
      const delay = () => Math.floor(Math.random() * 50) + 30;

      // Find username and password inputs
      const textInputs = await page.$$(
        'input[type="text"], input[name="username"], input[name="email"]',
      );
      const passInputs = await page.$$(
        'input[type="password"], input[name="password"], input[name="pass"]',
      );

      if (textInputs.length === 0 || passInputs.length === 0) {
        throw new Error('Could not find login input fields');
      }

      console.log('[instagram] Typing credentials...');
      await textInputs[0].type(this.username, { delay: delay() });

      // Small pause between fields (human-like)
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));

      await passInputs[0].type(this.password, { delay: delay() });

      // Small pause before submitting
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 700));

      console.log('[instagram] Submitting form...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        page.keyboard.press('Enter'),
      ]);

      // Wait a moment for cookies to settle
      await new Promise((r) => setTimeout(r, 3000));

      console.log('[instagram] Extracting cookies...');
      const cookies = await page.cookies();

      const sessionCookie = cookies.find((c: { name: string }) => c.name === 'sessionid');
      if (!sessionCookie) {
        throw new Error(
          'Login failed. Ensure credentials are correct and account is not locked/prompted for 2FA.',
        );
      }

      console.log(`[instagram] Successfully extracted ${cookies.length} cookies`);
      return cookies;
    } catch (error) {
      // Save debug screenshot on error
      const screenshotDir = config.cookiesDir;
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }

      const screenshotPath = path.join(screenshotDir, 'instagram_error.png');
      try {
        await page.screenshot({ path: screenshotPath });
        console.error(`[instagram] Error screenshot saved to ${screenshotPath}`);
      } catch {
        // ignore screenshot errors
      }

      throw error;
    } finally {
      await page.close();
    }
  }
}
