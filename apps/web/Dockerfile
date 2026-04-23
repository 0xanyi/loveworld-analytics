FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages packages
COPY apps/web apps/web
RUN pnpm install --frozen-lockfile --filter=@lwa/web...

FROM deps AS build
ARG VITE_API_BASE_URL=http://localhost:3001
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm -F @lwa/web build

FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY --from=build /app/apps/web/build ./build
COPY --from=build /app/apps/web/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "build"]
