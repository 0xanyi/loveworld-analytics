# NOTE: This Dockerfile is a Phase-0 placeholder. It will NOT produce a runnable
# image as written because the workspace packages (@lwa/auth, @lwa/db, etc.)
# export .ts source (not compiled JS) — `node dist/server.js` won't resolve
# workspace imports at runtime. A real build needs a bundler step (esbuild/vite)
# or per-package JS emission across the workspace. Re-addressed in Task 10
# (CI + deploy) where we pick a bundling strategy for Dokploy.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages packages
COPY services/api services/api
RUN pnpm install --frozen-lockfile --filter=@lwa/api...

FROM deps AS build
RUN pnpm -F @lwa/api build

FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/api ./services/api
COPY --from=build /app/package.json ./package.json
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "services/api/dist/server.js"]
