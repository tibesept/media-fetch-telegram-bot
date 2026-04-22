import fs from 'node:fs';
import { Bot, Context, InputFile } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import pLimit from 'p-limit';
import { config } from './config.js';
import { logger } from './logger.js';
import { extractFirstUrl, detectPlatform, normalizeUrl, detectYandexMusicType } from './url.js';
import { downloadVideo, downloadAudio, downloadPlaylist, cleanupFiles, mapDownloadErrorToUserText } from './downloader.js';

// Enforce maximum 2 concurrent yt-dlp instances globally.
// This prevents CPU/RAM exhaustion while not blocking the Telegram bot's ability to respond to users instantly.
const downloadQueue = pLimit(2);

export function createBot(): Bot<Context> {
  const bot = new Bot<Context>(config.botToken);

  // Auto-retry intercepts Telegram "429 Too Many Requests" and pauses the request instead of crashing
  bot.api.config.use(autoRetry({ maxRetryAttempts: 3 }));

  // Commands
  bot.command(['start', 'help'], async (ctx) => {
    await ctx.reply(helpText(), { link_preview_options: { is_disabled: true } });
  });

  bot.command('disclaimer', async (ctx) => {
    await ctx.reply(disclaimerText());
  });

  // Text messages — look for URLs
  bot.on('message:text', async (ctx) => {
    await handleMessage(ctx, ctx.message.text);
  });

  // Captions on photos/videos
  bot.on('message:caption', async (ctx) => {
    if (ctx.message.caption) {
      await handleMessage(ctx, ctx.message.caption);
    }
  });

  bot.catch((err) => {
    logger.error({ err: err.error, ctx: err.ctx?.update?.update_id }, 'Bot error');
  });

  return bot;
}

function isVipUser(userId: number | undefined): boolean {
  if (!userId) return false;
  const id = String(userId);
  return config.vipUserIds.includes(id) || config.adminUserIds.includes(id);
}

async function handleMessage(ctx: Context, text: string): Promise<void> {
  const url = extractFirstUrl(text);
  if (!url) return;

  const normalized = normalizeUrl(url);
  const platform = detectPlatform(normalized);

  if (!platform) {
    await ctx.reply(
      'Ссылка не поддерживается. Поддерживаются TikTok, Instagram, VK Видео, YouTube Shorts и Yandex Music.',
      { reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined },
    );
    logger.info({ url: normalized, chatId: ctx.chat?.id, userId: ctx.from?.id }, 'Unsupported URL');
    return;
  }

  const chatId = ctx.chat?.id?.toString();
  if (!chatId) return;

  const messageId = ctx.message?.message_id;

  if (platform === 'Yandex Music') {
    await handleYandexMusic(ctx, normalized, messageId);
    return;
  }

  // --- Video platforms ---

  // Inform the user
  if (downloadQueue.pendingCount > 0) {
    await ctx.reply(`В очереди перед вами: ${downloadQueue.pendingCount} видео. Ожидайте...`, {
      reply_parameters: messageId ? { message_id: messageId } : undefined,
    });
  } else {
    await ctx.reply('скачиваю..', {
      reply_parameters: messageId ? { message_id: messageId } : undefined,
    });
  }

  // Push the heavy yt-dlp task to the p-limit queue
  downloadQueue(async () => {
    logger.info({ url: normalized, platform, chatId, userId: ctx.from?.id }, 'Starting download');

    // Trigger download directly
    const download = await downloadVideo(normalized, platform);

    if (!download.ok) {
      const userText = mapDownloadErrorToUserText(download.error);
      await ctx.reply(userText, {
        reply_parameters: messageId ? { message_id: messageId } : undefined,
      });
      logger.error({ error: download.error, url: normalized }, 'Download failed');
      return;
    }

    // Attempt to send the video
    try {
      const caption = `@${config.botUsername} Скачивание видео из соцсетей`;
      const fileStream = new InputFile(download.filePath);
      
      await ctx.replyWithVideo(fileStream, {
        caption,
        supports_streaming: true,
        reply_parameters: messageId ? { message_id: messageId } : undefined,
      });
      
      logger.info({ url: normalized, fileSize: download.fileSize }, 'Job completed successfully');
    } catch (err) {
      await ctx.reply('Не удалось отправить видео в Telegram (возможно превышен лимит бота).', {
        reply_parameters: messageId ? { message_id: messageId } : undefined,
      });
      logger.error({ err, url: normalized }, 'Failed to send video');
    } finally {
      // Relying on try-finally guarantees instant temp file deletion without needing a cron job
      try {
        if (fs.existsSync(download.filePath)) {
          fs.unlinkSync(download.filePath);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  });
}

async function handleYandexMusic(ctx: Context, url: string, messageId: number | undefined): Promise<void> {
  const ymType = detectYandexMusicType(url);

  if (!ymType) {
    await ctx.reply(
      'Не удалось определить тип ссылки Yandex Music. Поддерживаются: трек, альбом, плейлист.',
      { reply_parameters: messageId ? { message_id: messageId } : undefined },
    );
    return;
  }

  if (ymType === 'track') {
    await handleYandexTrack(ctx, url, messageId);
  } else {
    await handleYandexPlaylistOrAlbum(ctx, url, ymType, messageId);
  }
}

async function handleYandexTrack(ctx: Context, url: string, messageId: number | undefined): Promise<void> {
  if (downloadQueue.pendingCount > 0) {
    await ctx.reply(`В очереди перед вами: ${downloadQueue.pendingCount} задач. Ожидайте...`, {
      reply_parameters: messageId ? { message_id: messageId } : undefined,
    });
  } else {
    await ctx.reply('🎵 скачиваю трек..', {
      reply_parameters: messageId ? { message_id: messageId } : undefined,
    });
  }

  downloadQueue(async () => {
    logger.info({ url, platform: 'Yandex Music', type: 'track', userId: ctx.from?.id }, 'Starting audio download');

    const download = await downloadAudio(url);

    if (!download.ok) {
      const userText = mapDownloadErrorToUserText(download.error);
      await ctx.reply(userText, {
        reply_parameters: messageId ? { message_id: messageId } : undefined,
      });
      logger.error({ error: download.error, url }, 'Audio download failed');
      return;
    }

    try {
      const fileStream = new InputFile(download.filePath);
      await ctx.replyWithAudio(fileStream, {
        caption: `@${config.botUsername}`,
        reply_parameters: messageId ? { message_id: messageId } : undefined,
      });
      logger.info({ url, fileSize: download.fileSize }, 'Audio sent successfully');
    } catch (err) {
      await ctx.reply('Не удалось отправить аудио в Telegram.', {
        reply_parameters: messageId ? { message_id: messageId } : undefined,
      });
      logger.error({ err, url }, 'Failed to send audio');
    } finally {
      try {
        if (fs.existsSync(download.filePath)) {
          fs.unlinkSync(download.filePath);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  });
}

async function handleYandexPlaylistOrAlbum(
  ctx: Context,
  url: string,
  ymType: 'album' | 'playlist',
  messageId: number | undefined,
): Promise<void> {
  const userId = ctx.from?.id;
  const vip = isVipUser(userId);
  const maxTracks = vip ? config.vipMaxPlaylistTracks : config.maxPlaylistTracks;
  const typeLabel = ymType === 'album' ? 'альбом' : 'плейлист';

  if (downloadQueue.pendingCount > 0) {
    await ctx.reply(`В очереди перед вами: ${downloadQueue.pendingCount} задач. Ожидайте...`, {
      reply_parameters: messageId ? { message_id: messageId } : undefined,
    });
  } else {
    await ctx.reply(`🎶 скачиваю ${typeLabel} (до ${maxTracks} треков)..`, {
      reply_parameters: messageId ? { message_id: messageId } : undefined,
    });
  }

  downloadQueue(async () => {
    logger.info(
      { url, platform: 'Yandex Music', type: ymType, maxTracks, userId, vip },
      'Starting playlist/album download',
    );

    const result = await downloadPlaylist(url, maxTracks);

    if (!result.ok) {
      const userText = mapDownloadErrorToUserText(result.error);
      await ctx.reply(userText, {
        reply_parameters: messageId ? { message_id: messageId } : undefined,
      });
      logger.error({ error: result.error, url }, 'Playlist download failed');
      return;
    }

    let sentCount = 0;
    const allFiles = result.files.map((f) => f.filePath);

    try {
      for (const file of result.files) {
        try {
          const fileStream = new InputFile(file.filePath);
          await ctx.replyWithAudio(fileStream, {
            caption: sentCount === 0 ? `@${config.botUsername}` : undefined,
          });
          sentCount++;
        } catch (err) {
          logger.warn({ err, filePath: file.filePath }, 'Failed to send one track');
          // Continue with remaining tracks
        }
      }

      if (sentCount === 0) {
        await ctx.reply('Не удалось отправить ни одного трека в Telegram.', {
          reply_parameters: messageId ? { message_id: messageId } : undefined,
        });
      } else {
        logger.info({ url, sentCount, total: result.files.length }, 'Playlist sent successfully');
      }
    } finally {
      cleanupFiles(allFiles);
    }
  });
}

function helpText(): string {
  return (
    `Пришлите ссылку на видео или музыку — бот отправит медиа в чат.\n\n` +
    `Добавьте @${config.botUsername} в чат, и бот будет присылать медиа сразу в чат.\n\n` +
    `Поддержка:\n` +
    `- TikTok\n` +
    `- Instagram (Reels и посты с видео)\n` +
    `- VK Видео\n` +
    `- YouTube Shorts\n` +
    `- 🎵 Yandex Music (треки, альбомы, плейлисты)`
  );
}

function disclaimerText(): string {
  return (
    'Бот работает только с публично доступным контентом. ' +
    'Пользователь сам несет ответственность за правомерность скачивания, хранения и распространения материалов.'
  );
}
