FROM node:20-slim AS base

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

FROM base AS deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY artifacts/api-server/package.json artifacts/api-server/
COPY lib/db/package.json lib/db/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/integrations-openai-ai-server/package.json lib/integrations-openai-ai-server/

RUN pnpm install --frozen-lockfile --filter @workspace/api-server...

FROM base AS build

COPY --from=deps /app/ /app/
COPY tsconfig.base.json ./
COPY lib/db/ lib/db/
COPY lib/api-zod/ lib/api-zod/
COPY lib/integrations-openai-ai-server/ lib/integrations-openai-ai-server/
COPY artifacts/api-server/ artifacts/api-server/

RUN pnpm --filter @workspace/api-server run build

FROM base AS runtime

COPY --from=deps /app/node_modules/ /app/node_modules/
COPY --from=deps /app/artifacts/api-server/node_modules/ /app/artifacts/api-server/node_modules/
COPY --from=build /app/artifacts/api-server/dist/ /app/artifacts/api-server/dist/

WORKDIR /app/artifacts/api-server

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
