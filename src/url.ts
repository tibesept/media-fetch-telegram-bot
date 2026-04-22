/**
 * URL extraction, platform detection, and normalization.
 * Direct port of logic from the original PHP bot.php.
 */

export function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/iu);
  return match ? match[0].trim() : null;
}

export type Platform = 'TikTok' | 'Instagram' | 'VK' | 'YouTube Shorts' | 'Yandex Music';

export type YandexMusicType = 'track' | 'album' | 'playlist';

export function detectPlatform(url: string): Platform | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (host.includes('tiktok.com')) return 'TikTok';
  if (host.includes('instagram.com')) return 'Instagram';
  if (host.includes('vk.com') || host.includes('vkvideo.ru') || host.includes('vk.ru'))
    return 'VK';

  if (host.includes('youtube.com') || host.includes('youtu.be')) {
    if (isYoutubeShortUrl(url)) return 'YouTube Shorts';
    return null;
  }

  // if (host.includes('music.yandex.ru') || host.includes('music.yandex.com')) {
  //   return 'Yandex Music';
  // }

  return null;
}

/**
 * Detect the Yandex Music URL sub-type: track, album, or playlist.
 * Returns null for unrecognized patterns.
 */
export function detectYandexMusicType(url: string): YandexMusicType | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }

  // Track: /album/123/track/456
  if (/\/album\/\d+\/track\/\d+/.test(pathname)) return 'track';

  // Playlist: /users/username/playlists/123
  if (/\/users\/[^/]+\/playlists\/\d+/.test(pathname)) return 'playlist';

  // Album: /album/123  (but not /album/123/track/456 — already matched above)
  if (/\/album\/\d+/.test(pathname)) return 'album';

  return null;
}

function isYoutubeShortUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;

  return host.includes('youtube.com') && /^\/shorts\/[^/]+/.test(path);
}

export function normalizeUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  let host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  let pathname = parsed.pathname;
  const params = new URLSearchParams();

  if (host === 'vk.ru') host = 'vk.com';

  if (host === 'instagram.com') {
    pathname = pathname.replace(/\/+/g, '/').replace(/\/+$/, '');
    const reelMatch = pathname.match(/^\/(reel|p)\/([A-Za-z0-9_-]+)/);
    if (reelMatch) {
      pathname = `/${reelMatch[1]}/${reelMatch[2]}/`;
    }
    // Strip all query params for Instagram
  } else if (host === 'youtube.com') {
    pathname = pathname.replace(/\/+/g, '/');
    const shortsMatch = pathname.match(/^\/shorts\/([^/?#]+)/);
    if (shortsMatch) {
      pathname = `/shorts/${shortsMatch[1]}`;
    } else {
      const v = parsed.searchParams.get('v');
      if (v) params.set('v', v);
    }
  } else if (host === 'youtu.be') {
    pathname = pathname.replace(/\/+/g, '/');
    const idMatch = pathname.match(/^\/([^/?#]+)/);
    if (idMatch) {
      host = 'youtube.com';
      pathname = '/watch';
      params.set('v', idMatch[1]);
    }
  } else if (host === 'tiktok.com') {
    pathname = pathname.replace(/\/+/g, '/');
    const tiktokMatch = pathname.match(/^\/(@[^/]+\/video\/\d+)/);
    if (tiktokMatch) {
      pathname = `/${tiktokMatch[1]}`;
    }
    // Strip all query params for TikTok
  } else if (host.startsWith('music.yandex.')) {
    // Normalize to music.yandex.ru, strip query params
    host = 'music.yandex.ru';
    pathname = pathname.replace(/\/+/g, '/').replace(/\/+$/, '');
  }

  const queryString = params.toString();
  return `${parsed.protocol}//${host}${pathname}${queryString ? '?' + queryString : ''}`;
}
