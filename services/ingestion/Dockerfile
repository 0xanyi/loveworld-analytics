FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages packages
COPY services/ingestion services/ingestion
RUN pnpm install --frozen-lockfile --filter=@lwa/ingestion...

FROM deps AS build
RUN pnpm -F @lwa/ingestion build

FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/ingestion ./services/ingestion
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
ENV NODE_ENV=production
CMD ["./node_modules/.bin/tsx", "services/ingestion/src/worker.ts"]
