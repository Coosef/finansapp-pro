# ---- Aşama 1: derleme ----
FROM node:22-alpine AS build
WORKDIR /app
# Build identity (stale-client teşhisi). .dockerignore .git'i dışladığından derleme
# içinde `git rev-parse` çalışmaz → SHA build-arg olarak DIŞARIDAN gelmeli, yoksa "dev".
# GHCR yayını (docker.yml) BUILD_SHA=<git short sha> geçirir → prod bundle exact commit'i gömer.
ARG BUILD_SHA=dev
ARG BUILD_TIME=
ENV BUILD_SHA=$BUILD_SHA
ENV BUILD_TIME=$BUILD_TIME
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Aşama 2: nginx ile statik sunum ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
