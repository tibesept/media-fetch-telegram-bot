import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

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

function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

export const config = {
  botToken: env('BOT_TOKEN'),
  adminUserIds: env('ADMIN_USER_IDS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  vipUserIds: env('VIP_USER_IDS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  ytdlpPath: env('YTDLP_PATH', '/usr/local/bin/yt-dlp'),
  ytdlpImpersonate: env('YTDLP_IMPERSONATE', ''),
  ytdlpProxy: env('YTDLP_PROXY', ''),
  ytdlpPlatformProxies: {
    'YouTube Shorts': env('YTDLP_PROXY_YOUTUBE', ''),
    Instagram: env('YTDLP_PROXY_INSTAGRAM', ''),
    TikTok: env('YTDLP_PROXY_TIKTOK', ''),
    VK: env('YTDLP_PROXY_VK', ''),
    'Yandex Music': env('YTDLP_PROXY_YANDEX', ''),
  } as Record<string, string>,

  cookiesDir: env('COOKIES_DIR', path.join(ROOT_DIR, 'cookies')),
  instagramCookiesMaxAgeSeconds: envInt('INSTAGRAM_COOKIES_MAX_AGE_SECONDS', 86400),

  maxVideoSizeBytes: envInt('MAX_VIDEO_SIZE_BYTES', 100 * 1024 * 1024),
  maxPlaylistTracks: envInt('MAX_PLAYLIST_TRACKS', 20),
  vipMaxPlaylistTracks: envInt('VIP_MAX_PLAYLIST_TRACKS', 100),
  tempDir: env('TEMP_DIR', path.join(ROOT_DIR, 'tmp')),
  logLevel: env('LOG_LEVEL', 'info'),

  processingTimeoutSeconds: envInt('PROCESSING_TIMEOUT_SECONDS', 900),

  botUsername: env('BOT_USERNAME', 'VFetchBot'),
} as const;

export type Config = typeof config;
