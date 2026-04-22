# --- Конфигурация ---

COMPOSE_BASE_FILE := docker-compose.yml
COMPOSE_OVERRIDE_FILE := docker-compose.override.yml
COMPOSE_PROD_FILE := docker-compose.prod.yml

# По умолчанию 'dev'. Для прода: make up ENV=prod
ENV ?= dev

COMPOSE_FILES := -f $(COMPOSE_BASE_FILE)

ifeq ($(ENV), dev)
    COMPOSE_FILES += -f $(COMPOSE_OVERRIDE_FILE)
endif
ifeq ($(ENV), prod)
    COMPOSE_FILES += -f $(COMPOSE_PROD_FILE)
endif

# --- Команды ---

.DEFAULT_GOAL := help

# Группа: Управление окружением
# --------------------------------------------------
up: ## Запустить окружение (dev по умолчанию, ENV=prod для прода)
	docker compose $(COMPOSE_FILES) up --build -d

up-fg: ## Запустить на переднем плане (с логами)
	docker compose $(COMPOSE_FILES) up --build

down: ## Остановить и удалить контейнеры и сети
	docker compose $(COMPOSE_FILES) down

stop: ## Остановить контейнеры, не удаляя их
	docker compose $(COMPOSE_FILES) stop

restart: ## Перезапустить все сервисы
	docker compose $(COMPOSE_FILES) restart

# Группа: Мониторинг и отладка
# --------------------------------------------------
logs: ## Показать логи всех сервисов в реальном времени
	docker compose $(COMPOSE_FILES) logs -f --tail=100

logs-bot: ## Показать логи только бота
	docker compose $(COMPOSE_FILES) logs -f --tail=100 bot

logs-cookies: ## Показать логи cookie-getter
	docker compose $(COMPOSE_FILES) logs -f --tail=100 cookie-getter

ps: ## Показать статус контейнеров
	docker compose $(COMPOSE_FILES) ps

shell-bot: ## Зайти в shell бота
	docker compose $(COMPOSE_FILES) exec bot sh

shell-cookies: ## Зайти в shell cookie-getter
	docker compose $(COMPOSE_FILES) exec cookie-getter sh

# Группа: Сборка и очистка
# --------------------------------------------------
build: ## Принудительно пересобрать образы без запуска
	docker compose $(COMPOSE_FILES) build

rebuild: ## Пересобрать образы без кэша (полная чистая сборка)
	docker compose $(COMPOSE_FILES) build --no-cache

clean: down ## Полная очистка: остановить, удалить контейнеры, сети и образы
	docker compose $(COMPOSE_FILES) down --rmi all --remove-orphans

# Группа: Утилиты
# --------------------------------------------------
yt-targets: ## Показать доступные impersonate-таргеты yt-dlp
	docker compose $(COMPOSE_FILES) run --rm bot yt-dlp --list-impersonate-targets

yt-version: ## Показать версию yt-dlp внутри контейнера
	docker compose $(COMPOSE_FILES) run --rm bot yt-dlp --version

# Группа: Справка
# --------------------------------------------------
help: ## Показать эту справку
	@echo ""
	@echo "  \033[1mSavebot — Telegram Media Downloader\033[0m"
	@echo "  ENV=$(ENV)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  Примеры:"
	@echo "    make up              # dev-режим (hot reload, без rebuild)"
	@echo "    make up ENV=prod     # production (собрать и запустить)"
	@echo "    make logs            # логи"
	@echo ""

.PHONY: up up-fg down stop restart logs logs-bot logs-cookies ps shell-bot shell-cookies build rebuild clean yt-targets yt-version help
