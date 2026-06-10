# Diamond Agent backend — Bun runtime, deployed on Railway.
# Build context = the backend/ directory (set Railway "Root Directory" to backend).
FROM oven/bun:1

WORKDIR /app

# Install deps first for layer caching. bun.lock keeps it reproducible.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# App source.
COPY . .

# Uploaded + generated files live here. Mount a Railway volume at this path so
# they survive deploys/restarts (single always-on instance). See DEPLOY.md.
RUN mkdir -p /app/uploads
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
