# Build the web app
FROM node:22-bookworm-slim AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY web ./
RUN npx vite build --outDir /out --emptyOutDir

# Install server dependencies (native module included)
FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Runtime image
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8130 DATA_DIR=/data COOKIE_SECURE=1
WORKDIR /app/server
COPY --from=deps /app/server/node_modules ./node_modules
COPY server ./
COPY --from=web /out ./public
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 8130
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:8130/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
