# FinansApp Telegram Finance Gateway (T1B) — outbound-only, non-root, AÇIK PORT YOK.
# Build context = REPO KÖKÜ (gateway ../../src/lib saf helper'larını reuse eder → tek kaynak).
#   docker build -f gateway/Dockerfile --build-arg BUILD_SHA=$(git rev-parse --short HEAD) .
FROM node:22-slim

# Build identity (.git context'te yok → SHA dışarıdan build-arg; yoksa "dev").
ARG BUILD_SHA=dev
ENV BUILD_SHA=${BUILD_SHA} \
    NODE_ENV=production \
    TZ=Europe/Istanbul \
    HEARTBEAT_FILE=/tmp/tg-gateway-heartbeat

WORKDIR /app

# Yalnız gereken saf lib'ler + gateway kaynağı. Bağımlılık YOK (node builtins + global fetch)
# → npm install gerekmez. `node` kullanıcısı (uid 1000) resmi imajda hazır → NON-ROOT.
COPY --chown=node:node src/lib /app/src/lib
COPY --chown=node:node gateway/package.json /app/gateway/package.json
COPY --chown=node:node gateway/src /app/gateway/src

WORKDIR /app/gateway
USER node

# AÇIK PORT YOK (EXPOSE yok). Sağlık = kalp atışı dosyasının tazeliği (poll her turda yazar).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "src/health-check.js"]

CMD ["node", "src/index.js"]
