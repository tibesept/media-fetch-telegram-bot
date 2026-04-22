import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

/**
 * Atomically write a cookie file to the shared cookies directory.
 * Uses write-to-tmp + rename to avoid partial reads by the bot.
 */
export function writeCookieFile(fileName: string, content: string): void {
  const dir = config.cookiesDir;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const target = path.join(dir, fileName);
  const tmp = `${target}.tmp.${Date.now()}`;

  fs.writeFileSync(tmp, content, { mode: 0o600 });
  fs.renameSync(tmp, target);
}
