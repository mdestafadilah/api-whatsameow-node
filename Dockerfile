# ─────────────────────────────────────────────────────────────────────────────
# whatsmeow-api
#
# Runs on Bun. Not only is that faster — it is what makes this image possible at
# all: the API needs `whatsmeow-node`, which spawns a native Go binary per
# WhatsApp session, and it needs SQLite, which Bun ships as `bun:sqlite`. No
# compiler toolchain, no node-gyp, no native addon to rebuild at image build
# time.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: dependencies ────────────────────────────────────────────────────
# `bunfig.toml` is copied deliberately: without `install.peer = false` Bun
# auto-installs drizzle-orm's optional peers, one of which is better-sqlite3 —
# a native addon this project no longer uses and cannot build here.
FROM oven/bun:1.3.14 AS deps

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./

# `--production` keeps vite, typescript and vitest out of the runtime image.
RUN bun install --production

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
# Bun executes TypeScript directly, so there is no build stage to bundle the
# server: `src/` is shipped as-written and the entry point is the same file you
# edit locally.
FROM oven/bun:1.3.14 AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/app/data/whatsmeow.db \
    SESSION_DIR=/app/data/sessions

COPY --from=deps /app/node_modules ./node_modules

# `tsconfig.json` is required at runtime, not just for type-checking: it is
# where the `@/*` import alias is declared, and Bun reads it to resolve imports.
COPY package.json bunfig.toml tsconfig.json ./
COPY src ./src

# Created here, not by the server, so the volume that mounts over it inherits
# this directory's ownership and the process can actually write to it.
RUN mkdir -p /app/data /app/data/sessions

EXPOSE 3000

# `/api/name` sits in front of the auth middleware, so it answers even when
# API_KEY is set.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/name').then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["bun", "src/server.ts"]
