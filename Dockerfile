# ReaFuse web lab. Built on REA (Reverse Engineer Anything).
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# The lab's brain: Claude Code CLI. Log in once per server:
#   docker exec -it reafuse claude   (then /login)
RUN npm install -g @anthropic-ai/claude-code@2.1.296 && npm cache clean --force

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY bin ./bin
COPY src ./src
COPY web ./web
COPY showcase ./showcase
COPY README.md LICENSE NOTICE.md ./

# Lab runs, donor cache and the CLI's login live on the /data volume.
RUN mkdir -p /data/lab /data/home && chown -R node:node /data
ENV NODE_ENV=production \
    PORT=4400 \
    HOME=/data/home \
    REAFUSE_LAB=/data/lab \
    REAFUSE_BRAIN=claude-cli \
    REAFUSE_MAX_CONCURRENT=1 \
    REAFUSE_RUNS_PER_HOUR=6
USER node
VOLUME /data
EXPOSE 4400
CMD ["node", "web/server.mjs"]
