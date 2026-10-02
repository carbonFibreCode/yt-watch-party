# Server + built SPA in one image (LLD SP-23). Used by the docker compose `scale` profile;
# Render builds natively from render.yaml instead.
FROM node:24-alpine AS build
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile && pnpm build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
USER node
EXPOSE 3000
CMD ["node", "apps/server/dist/main.mjs"]
