import 'dotenv/config';
import path from 'node:path';

function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) throw new Error(`Invalid integer for ${key}: ${raw}`);
  return parsed;
}

export const config = {
  instagramLogin: env('INSTAGRAM_LOGIN', ''),
  instagramPassword: env('INSTAGRAM_PASSWORD', ''),
  cookiesDir: env('COOKIES_DIR', '/app/cookies'),
  refreshIntervalMinutes: envInt('COOKIE_REFRESH_INTERVAL_MINUTES', 15),
  logLevel: env('LOG_LEVEL', 'info'),
  puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
} as const;
