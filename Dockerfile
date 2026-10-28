# node:22-slim (glibc) so better-sqlite3 uses prebuilt binaries — no toolchain needed.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/ajaia.db

# Mount a persistent volume at /data so the SQLite file survives restarts.
VOLUME /data

EXPOSE 3000
CMD ["node", "server/index.js"]
