FROM node:20-slim AS base

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

FROM base AS deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY artifacts/recipe-agent/package.json artifacts/recipe-agent/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY lib/api-spec/package.json lib/api-spec/

RUN pnpm install --frozen-lockfile --filter @workspace/recipe-agent...

FROM base AS build

COPY --from=deps /app/ /app/
COPY tsconfig.base.json ./
COPY lib/api-zod/ lib/api-zod/
COPY lib/api-client-react/ lib/api-client-react/
COPY lib/api-spec/ lib/api-spec/
COPY artifacts/recipe-agent/ artifacts/recipe-agent/

ENV BASE_PATH=/
ENV PORT=5173
RUN pnpm --filter @workspace/recipe-agent run build

FROM node:20-slim AS runtime

RUN npm install -g serve

COPY --from=build /app/artifacts/recipe-agent/dist/public/ /app/public/

ENV NODE_ENV=production
EXPOSE 5173

CMD ["serve", "-s", "/app/public", "-l", "5173"]
