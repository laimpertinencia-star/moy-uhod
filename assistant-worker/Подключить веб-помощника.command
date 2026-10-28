#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

printf '\nМой уход — безопасное подключение веб-поиска\n\n'
if ! command -v node >/dev/null 2>&1 || ! command -v npx >/dev/null 2>&1; then
  printf 'Для настройки нужен Node.js. Установи актуальную LTS-версию с https://nodejs.org/ и запусти этот файл снова.\n'
  read -r -p 'Нажми Enter, чтобы закрыть окно.'
  exit 1
fi

printf 'Сейчас откроется Cloudflare для входа. API-ключ будет введён скрыто и отправлен напрямую в Cloudflare как секрет. Он не сохранится в проекте.\n'
read -r -p 'Продолжить? [y/N] ' answer
case "$answer" in y|Y|yes|YES|д|Д|да|ДА) ;; *) printf 'Настройка отменена.\n'; exit 0 ;; esac

npx wrangler login

printf '\nСоздай отдельный API-ключ в OpenAI Platform. Вставь его в следующее поле; ввод не будет отображаться.\n'
read -r -s -p 'API key: ' assistant_api_key
printf '\n'
if [[ -z "$assistant_api_key" ]]; then
  printf 'Пустой ключ. Worker не развёрнут.\n'
  exit 1
fi
printf '%s' "$assistant_api_key" | npx wrangler secret put OPENAI_API_KEY
unset assistant_api_key

printf '\nРазворачиваю сервер помощника…\n'
npx wrangler deploy

printf '\nГотово. Скопируй выданный адрес workers.dev и добавь к нему /v1/chat/completions.\nЗатем вставь этот полный HTTPS-адрес в настройках помощника приложения. Проверь, что ALLOWED_ORIGINS в wrangler.jsonc содержит точный origin сайта.\n'
read -r -p 'Нажми Enter, чтобы закрыть окно.'
