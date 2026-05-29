# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

ARG PNPM_VERSION=9.15.4

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN corepack enable \
  && corepack prepare pnpm@$PNPM_VERSION --activate \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/media/package.json apps/media/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY apps apps
COPY packages packages
COPY prisma prisma

RUN pnpm db:generate
RUN pnpm --filter @eiscord/shared build
RUN pnpm --filter @eiscord/media build
RUN pnpm --filter @eiscord/api build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV="production"
ENV PORT="3000"
ENV MEDIA_WORKER_ENTRY="/app/apps/media/dist/main.js"

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && chown -R node:node /app

COPY --from=build --chown=node:node /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api ./apps/api
COPY --from=build --chown=node:node /app/apps/media ./apps/media
COPY --from=build --chown=node:node /app/packages/config ./packages/config
COPY --from=build --chown=node:node /app/packages/shared ./packages/shared
COPY --from=build --chown=node:node /app/prisma ./prisma

USER node

EXPOSE 3000
EXPOSE 40000-40100/udp

CMD ["node", "apps/api/dist/main.js"]
