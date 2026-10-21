FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm run typecheck:libs
RUN pnpm --filter @workspace/api-server run build
RUN PORT=3000 BASE_PATH=/ pnpm --filter @workspace/festiland-gestion run build
RUN pnpm --filter @workspace/api-server deploy --prod --legacy /runtime

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    SERVE_STATIC=true \
    STATIC_DIR=/app/public \
    MIGRATIONS_DIR=/app/migrations \
    SQLITE_PATH=/data/festiland.sqlite
RUN mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /runtime/node_modules ./node_modules
COPY --from=build --chown=node:node /app/artifacts/api-server/dist ./dist
COPY --from=build --chown=node:node /app/artifacts/festiland-gestion/dist/public ./public
COPY --from=build --chown=node:node /app/lib/db/migrations-sqlite ./migrations
COPY --chown=node:node deploy/start.sh ./start.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "/app/start.sh"]
