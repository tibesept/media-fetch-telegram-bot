# =============================================
# ЭТАП 1: BUILDER
# Все зависимости (system + npm) + сборка
# В dev-режиме используется как финальный образ
# =============================================
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp + curl_cffi for --impersonate support
RUN pip3 install --break-system-packages yt-dlp "curl_cffi>=0.10,<0.15"

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

RUN mkdir -p cookies tmp data

# =============================================
# ЭТАП 2: PRODUCTION
# Легковесный образ для прода
# =============================================
FROM node:20-slim AS production

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages yt-dlp "curl_cffi>=0.10,<0.15"

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

RUN mkdir -p cookies tmp data

CMD ["node", "dist/index.js"]
