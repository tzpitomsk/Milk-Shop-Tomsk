#!/bin/bash

set -euo pipefail

IP="$(ipconfig getifaddr en0 2>/dev/null || true)"

if [ -z "$IP" ]; then
  IP="$(ipconfig getifaddr en1 2>/dev/null || true)"
fi

if [ -z "$IP" ]; then
  echo ""
  echo "❌ Не удалось определить IP-адрес MacBook."
  echo "Проверь подключение к Wi-Fi."
  echo ""
  exit 1
fi

CERT="./${IP}.pem"
KEY="./${IP}-key.pem"

echo ""
echo "📱 Milk Shop — запуск для Android"
echo ""
echo "🌐 Текущий IP: $IP"
echo ""

if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
  echo "🔐 Сертификат для $IP не найден."
  echo "Создаём новый сертификат через mkcert..."
  echo ""

  mkcert "$IP"

  echo ""
  echo "✅ Новый сертификат создан."
  echo ""
fi

echo "🚀 Запускаем Next.js..."
echo ""
echo "📱 Открой на Android:"
echo "https://${IP}:3000"
echo ""

DEV_ORIGIN="$IP" \
npx next dev \
  --hostname 0.0.0.0 \
  --experimental-https \
  --experimental-https-key "$KEY" \
  --experimental-https-cert "$CERT"