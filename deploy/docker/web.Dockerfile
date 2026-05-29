# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

ARG PNPM_VERSION=9.15.4

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN corepack enable \
  && corepack prepare pnpm@$PNPM_VERSION --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY apps/web apps/web
COPY packages packages

ARG PUBLIC_API_BASE_URL
ARG PUBLIC_REALTIME_URL

ENV PUBLIC_API_BASE_URL="$PUBLIC_API_BASE_URL"
ENV PUBLIC_REALTIME_URL="$PUBLIC_REALTIME_URL"

RUN pnpm --filter @eiscord/shared build
RUN pnpm --filter @eiscord/web build

FROM caddy:2.8-alpine AS runtime

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv/eiscord

EXPOSE 80
EXPOSE 443
