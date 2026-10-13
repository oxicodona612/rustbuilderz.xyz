# syntax=docker/dockerfile:1
# Build from the repository root:
#   docker build -f apps/presence/Dockerfile -t rustbuilderz-presence .

FROM node:26-alpine AS build
WORKDIR /repo
RUN npm install --global pnpm@11.9.0

# Manifests first, so dependency layers stay cached between source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/presence/package.json apps/presence/
COPY apps/web/package.json apps/web/
COPY packages/presence-protocol/package.json packages/presence-protocol/
RUN pnpm install --frozen-lockfile --filter "@rustbuilderz/presence..."

COPY packages/presence-protocol packages/presence-protocol
COPY apps/presence apps/presence
RUN pnpm --filter @rustbuilderz/presence build \
 && pnpm --filter @rustbuilderz/presence deploy --prod --legacy /out


FROM node:26-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist

USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s \
  CMD wget -qO /dev/null "http://127.0.0.1:${PORT:-4100}/healthz" || exit 1
CMD ["node", "--enable-source-maps", "dist/index.js"]
