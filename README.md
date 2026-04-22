# Savebot — Telegram Media Downloader

Telegram-бот для скачивания видео и музыки из соцсетей.

## Поддержка платформ

- **TikTok** — публичные видео
- **Instagram** — Reels и посты с видео (требуются cookies)
- **VK Видео** — публичные видео
- **YouTube Shorts** — `youtube.com/shorts/...`
- **🎵 Yandex Music** — треки, альбомы, плейлисты

## Быстрый старт

### 1. Настройте окружение

```bash
cp .env.example .env
# Заполните BOT_TOKEN и остальные переменные
```

### 2. Запустите

```bash
# Dev-режим (hot reload, без пересборки при изменениях кода)
make up

# Production
make up ENV=prod
```

### 3. Полезные команды

```bash
make help            # Показать все команды
make logs            # Логи в реальном времени
make logs-bot        # Логи только бота
make down            # Остановить
make rebuild         # Пересобрать без кэша
make yt-targets      # Проверить impersonate-таргеты yt-dlp
```

## Архитектура

### Сервисы (Docker Compose)

| Сервис | Описание |
|---|---|
| `bot` | Основной Telegram-бот (Node.js + grammY + yt-dlp) |
| `cookie-getter` | Микросервис для автоматического обновления Instagram cookies (Puppeteer) |

### Docker Compose файлы

| Файл | Назначение |
|---|---|
| `docker-compose.yml` | Базовая конфигурация |
| `docker-compose.override.yml` | Dev: builder stage, `tsx watch`, монтирование исходников |
| `docker-compose.prod.yml` | Prod: production stage, `restart: always` |

### Технологический стек

- **Runtime:** Node.js 20
- **Framework:** grammY (Telegram Bot API)
- **Language:** TypeScript
- **Downloader:** yt-dlp + curl_cffi (impersonate) + ffmpeg (аудио конвертация)
- **Queue:** p-limit (макс. 2 параллельных скачивания)

## Конфигурация (.env)

| Переменная | Описание |
|---|---|
| `BOT_TOKEN` | Токен Telegram-бота от BotFather |
| `BOT_USERNAME` | Username бота (для подписей) |
| `ADMIN_USER_IDS` | Telegram ID админов (через запятую) |
| `VIP_USER_IDS` | Telegram ID VIP-пользователей (увеличенный лимит плейлистов) |
| `YTDLP_IMPERSONATE` | Impersonate target (например `chrome`) |
| `YTDLP_PROXY` | Глобальный прокси |
| `YTDLP_PROXY_*` | Прокси по платформам (YOUTUBE, INSTAGRAM, TIKTOK, VK, YANDEX) |
| `MAX_PLAYLIST_TRACKS` | Лимит треков из плейлиста (по умолчанию 20) |
| `VIP_MAX_PLAYLIST_TRACKS` | Лимит для VIP (по умолчанию 100) |

## Команды бота

- `/start`, `/help` — справка
- `/disclaimer` — юридический дисклеймер

## Ограничения

- Максимальный размер видео: 100 MB (лимит Telegram)
- Максимальный размер аудио: 50 MB (лимит Telegram)
- Yandex Music доступен только из РФ/СНГ (или через прокси)
- Instagram требует cookies для стабильной работы

## Лицензия

Проект для личного использования. Пользователь несёт ответственность за правомерность скачивания контента.
