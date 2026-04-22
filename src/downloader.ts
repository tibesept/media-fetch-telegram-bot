import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { logger } from './logger.js';
import type { Platform } from './url.js';

export type DownloadSuccess = {
  ok: true;
  filePath: string;
  fileSize: number;
};

export type DownloadFailure = {
  ok: false;
  error: string;
};

export type DownloadResult = DownloadSuccess | DownloadFailure;

/** Result of a multi-track download (album/playlist) */
export type MultiDownloadResult = {
  ok: true;
  files: Array<{ filePath: string; fileSize: number }>;
} | {
  ok: false;
  error: string;
};

function getProxyForPlatform(platform: string): string {
  const proxy = config.ytdlpPlatformProxies[platform] || '';
  return proxy || config.ytdlpProxy;
}

function getInstagramCookiesPath(): string | null {
  const file = path.join(config.cookiesDir, 'instagram.txt');
  if (!fs.existsSync(file)) return null;

  const stat = fs.statSync(file);
  const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;
  if (ageSeconds > config.instagramCookiesMaxAgeSeconds) return null;

  return file;
}

interface DownloadAttempt {
  args: string[];
}

function buildDownloadAttempts(platform: Platform | string): DownloadAttempt[] {
  const attempts: DownloadAttempt[] = [];
  const common: string[] = [];

  if (config.ytdlpImpersonate) {
    common.push('--impersonate', config.ytdlpImpersonate);
  }

  // Attempt 1: default with format 'b'
  attempts.push({ args: [...common, '--format', 'b'] });

  if (platform === 'YouTube Shorts') {
    attempts.push({
      args: [
        ...common,
        '--extractor-args', 'youtube:player_client=android,web,mweb,tv_simply,tv_embedded',
        '--format', 'b',
      ],
    });
    attempts.push({
      args: [
        ...common,
        '--extractor-args', 'youtube:player_client=android,web,mweb,tv_simply,tv_embedded;player_skip=webpage,configs',
        '--format', 'b',
      ],
    });
  }

  if (platform === 'Instagram') {
    attempts.push({
      args: [...common, '--extractor-args', 'instagram:api_version=v1', '--format', 'b'],
    });
    attempts.push({
      args: [...common, '--extractor-args', 'instagram:api_version=v1'],
    });
  }

  // Fallback: no format spec
  attempts.push({ args: common });

  return attempts;
}

function runYtDlp(args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(config.ytdlpPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: config.processingTimeoutSeconds * 1000,
    });

    const chunks: Buffer[] = [];

    proc.stdout.on('data', (data: Buffer) => chunks.push(data));
    proc.stderr.on('data', (data: Buffer) => chunks.push(data));

    proc.on('close', (code) => {
      resolve({
        code: code ?? 1,
        output: Buffer.concat(chunks).toString('utf-8'),
      });
    });

    proc.on('error', (err) => {
      resolve({ code: 1, output: err.message });
    });
  });
}

export async function downloadVideo(url: string, platform: Platform | string): Promise<DownloadResult> {
  if (!fs.existsSync(config.tempDir)) {
    fs.mkdirSync(config.tempDir, { recursive: true });
  }

  const uniq = randomBytes(8).toString('hex');
  const outputTemplate = path.join(config.tempDir, `${uniq}.%(ext)s`);

  const attempts = buildDownloadAttempts(platform);
  let lastResult = { code: 1, output: 'Not started' };

  for (const attempt of attempts) {
    const args: string[] = [
      '--force-ipv4',
      '--no-playlist',
      '--restrict-filenames',
      '--no-progress',
      '--newline',
      '--retries', '5',
      '--fragment-retries', '5',
      '--extractor-retries', '5',
      '--file-access-retries', '3',
      '--sleep-requests', '1',
      '--min-sleep-interval', '1',
      '--max-sleep-interval', '3',
      '--socket-timeout', '20',
      '--hls-prefer-native',
      '--concurrent-fragments', '4',
      '-S', 'ext:mp4:m4a',
      '--max-filesize', String(config.maxVideoSizeBytes),
      '--output', outputTemplate,
      '--add-header', 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      '--add-header', 'Accept-Language: ru-RU,ru;q=0.9,en;q=0.8',
    ];

    const proxy = getProxyForPlatform(platform);
    if (proxy) {
      args.push('--proxy', proxy);
    }

    if (platform === 'Instagram') {
      args.push('--add-header', 'Referer: https://www.instagram.com/');
      const cookiesPath = getInstagramCookiesPath();
      if (cookiesPath) {
        args.push('--cookies', cookiesPath);
      }
    }

    if (platform === 'TikTok') {
      args.push('--add-header', 'Referer: https://www.tiktok.com/');
    }

    args.push(...attempt.args, url);

    logger.debug({ platform, attempt: attempt.args }, 'Running yt-dlp attempt');
    lastResult = await runYtDlp(args);

    const files = findOutputFiles(uniq);
    if (lastResult.code === 0 && files.length > 0) {
      const filePath = files[0];
      const stat = fs.statSync(filePath);

      if (stat.size <= 0) {
        cleanupFiles(files);
        return { ok: false, error: 'Downloaded empty file' };
      }

      if (stat.size > config.maxVideoSizeBytes) {
        cleanupFiles(files);
        return { ok: false, error: 'Video is bigger than 100 MB' };
      }

      return { ok: true, filePath, fileSize: stat.size };
    }

    cleanupFiles(files);
  }

  return { ok: false, error: lastResult.output || 'Unknown download error' };
}

/**
 * Download a single audio track (Yandex Music).
 * Uses -x to extract audio and --audio-format mp3 for Telegram compatibility.
 */
export async function downloadAudio(url: string): Promise<DownloadResult> {
  if (!fs.existsSync(config.tempDir)) {
    fs.mkdirSync(config.tempDir, { recursive: true });
  }

  const uniq = randomBytes(8).toString('hex');
  const outputTemplate = path.join(config.tempDir, `${uniq}.%(ext)s`);

  const args: string[] = [
    '--force-ipv4',
    '--no-playlist',
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '--embed-thumbnail',
    '--embed-metadata',
    '--restrict-filenames',
    '--no-progress',
    '--newline',
    '--retries', '5',
    '--extractor-retries', '5',
    '--file-access-retries', '3',
    '--socket-timeout', '20',
    '--output', outputTemplate,
  ];

  const proxy = getProxyForPlatform('Yandex Music');
  if (proxy) {
    args.push('--proxy', proxy);
  }

  args.push(url);

  logger.debug({ url }, 'Running yt-dlp audio download');
  const result = await runYtDlp(args);

  const files = findOutputFiles(uniq);
  if (result.code === 0 && files.length > 0) {
    const filePath = files[0];
    const stat = fs.statSync(filePath);

    if (stat.size <= 0) {
      cleanupFiles(files);
      return { ok: false, error: 'Downloaded empty file' };
    }

    // Telegram audio limit is 50 MB
    if (stat.size > 50 * 1024 * 1024) {
      cleanupFiles(files);
      return { ok: false, error: 'Аудиофайл больше 50 MB — лимит Telegram.' };
    }

    return { ok: true, filePath, fileSize: stat.size };
  }

  cleanupFiles(files);
  return { ok: false, error: result.output || 'Unknown audio download error' };
}
//
/**
 * Download multiple tracks from a Yandex Music playlist or album.
 * Limits the number of tracks via --playlist-items.
 */
export async function downloadPlaylist(url: string, maxTracks: number): Promise<MultiDownloadResult> {
  if (!fs.existsSync(config.tempDir)) {
    fs.mkdirSync(config.tempDir, { recursive: true });
  }

  const uniq = randomBytes(8).toString('hex');
  const outputTemplate = path.join(config.tempDir, `${uniq}_%(playlist_index)03d.%(ext)s`);

  const args: string[] = [
    '--force-ipv4',
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '--embed-thumbnail',
    '--embed-metadata',
    '--restrict-filenames',
    '--no-progress',
    '--newline',
    '--retries', '5',
    '--extractor-retries', '5',
    '--file-access-retries', '3',
    '--socket-timeout', '20',
    '--playlist-items', `1:${maxTracks}`,
    '--output', outputTemplate,
  ];

  const proxy = getProxyForPlatform('Yandex Music');
  if (proxy) {
    args.push('--proxy', proxy);
  }

  args.push(url);

  logger.info({ url, maxTracks }, 'Running yt-dlp playlist download');
  const result = await runYtDlp(args);

  const files = findOutputFiles(uniq)
    .sort()  // ensures playlist order by filename
    .filter((f) => {
      try {
        return fs.statSync(f).size > 0;
      } catch {
        return false;
      }
    });

  if (result.code === 0 && files.length > 0) {
    const fileInfos = files.map((f) => ({
      filePath: f,
      fileSize: fs.statSync(f).size,
    }));

    // Filter out files larger than Telegram's 50 MB limit
    const validFiles = fileInfos.filter((f) => f.fileSize <= 50 * 1024 * 1024);

    if (validFiles.length === 0) {
      cleanupFiles(files);
      return { ok: false, error: 'Все треки превысили лимит 50 MB.' };
    }

    // Cleanup oversized files
    const oversized = fileInfos.filter((f) => f.fileSize > 50 * 1024 * 1024);
    cleanupFiles(oversized.map((f) => f.filePath));

    return { ok: true, files: validFiles };
  }

  cleanupFiles(files);
  return { ok: false, error: result.output || 'Unknown playlist download error' };
}

function findOutputFiles(uniq: string): string[] {
  if (!fs.existsSync(config.tempDir)) return [];
  return fs
    .readdirSync(config.tempDir)
    .filter((f) => f.startsWith(uniq))
    .map((f) => path.join(config.tempDir, f));
}

function cleanupFiles(files: string[]): void {
  for (const f of files) {
    try {
      fs.unlinkSync(f);
    } catch {
      // ignore
    }
  }
}

export { cleanupFiles };

export function mapDownloadErrorToUserText(error: string): string {
  const base = 'Не удалось извлечь медиа. ';

  if (/requested format.*not available|ffmpeg|mux/i.test(error)) {
    return base + 'Для этого ролика нужна постобработка/склейка дорожек, а она недоступна на сервере.';
  }

  if (/file is larger|bigger than max|larger than/i.test(error)) {
    return base + 'Размер файла превышает лимит.';
  }

  if (/login required|sign in|confirm you.*not a bot|rate-limit/i.test(error)) {
    return base + 'Платформа вернула anti-bot или rate-limit ответ. Обычно помогает повторить позже.';
  }

  if (/unable to extract|unavailable|not found/i.test(error)) {
    return base + 'Контент недоступен или не найден.';
  }

  return base + 'Проверьте, что ссылка публичная и поддерживается.';
}
